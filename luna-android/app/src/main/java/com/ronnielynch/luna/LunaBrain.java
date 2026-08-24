package com.ronnielynch.luna;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

/**
 * Luna's brain: talks to the Gemini API for two things -
 *  - capture(): pulls entities/relationships out of captured text into the GraphStore
 *  - ask(): answers a question, grounded in the graph, with the ability to act on
 *    the phone via the same tool-calling loop as before (open_app/show_screen/tap/...)
 *
 * No persisted chat history - each ask() is a fresh, short exchange (mirroring the
 * "ask a question" bar in the UI rather than a running chat thread); anything worth
 * remembering long-term lives in the GraphStore or the activity log instead.
 */
public class LunaBrain {

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_API_KEY = "gemini_api_key";
    private static final String PREF_MUTED = "muted";
    private static final String PREF_ALWAYS_LISTENING = "always_listening";

    private static final String MODEL = "gemini-3.6-flash";

    private static final String ASK_SYSTEM_PROMPT =
            "You are Luna, a warm, concise personal AI assistant running natively on the " +
            "user's Android phone. Keep spoken replies short and conversational.\n\n" +
            "Here is what you currently know (the user's knowledge graph) - use it if it's " +
            "relevant to the question, otherwise just answer normally:\n\n";

    private static final String TOOLS_ADDENDUM =
            "\n\nYou can also control the phone's screen using tools: open_app, show_screen, " +
            "tap, type_text, scroll and press_key. When a request needs you to do something on " +
            "screen, call open_app if you need a different app in front, show_screen to see the " +
            "numbered elements currently on screen, then tap/type_text/scroll/press_key by " +
            "number. Call show_screen again after anything changes - numbers are only valid for " +
            "the most recent show_screen call. If those tools fail because screen control isn't " +
            "enabled, tell the user to enable it in Luna's settings.";

    private static final String EXTRACT_SYSTEM_PROMPT =
            "You are Luna's knowledge-extraction engine. Given a piece of text a user captured " +
            "(a note, contact, document excerpt, meeting notes, anything), call record_entities " +
            "with every distinct real-world entity it mentions - people, places, documents, " +
            "projects, technologies, AI models, concepts, tasks - and the relationships between " +
            "them. Keep labels short (2-4 words). Only record what's actually in the text.";

    private static final int MAX_TOOL_STEPS = 8;

    public interface Listener {
        void onToolStep(String description);
        void onReply(String text);
        void onError(String text);
    }

    public interface CaptureListener {
        void onResult(int addedEntities, int addedLinks);
        void onError(String text);
    }

    private final Context appContext;
    private final SharedPreferences prefs;
    private final GraphStore store;

    public LunaBrain(Context context) {
        this.appContext = context.getApplicationContext();
        this.prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        this.store = new GraphStore(appContext);
    }

    public GraphStore getStore() { return store; }

    public String getApiKey() { return prefs.getString(PREF_API_KEY, ""); }
    public void setApiKey(String key) { prefs.edit().putString(PREF_API_KEY, key).apply(); }

    public boolean isMuted() { return prefs.getBoolean(PREF_MUTED, false); }
    public void setMuted(boolean muted) { prefs.edit().putBoolean(PREF_MUTED, muted).apply(); }

    public boolean isAlwaysListening() { return prefs.getBoolean(PREF_ALWAYS_LISTENING, false); }
    public void setAlwaysListening(boolean value) { prefs.edit().putBoolean(PREF_ALWAYS_LISTENING, value).apply(); }

    public boolean isScreenControlEnabled() { return LunaAccessibilityService.getInstance() != null; }

    // ---------- ask (grounded Q&A + phone-control tool loop) ----------

    public void ask(String question, Listener listener) {
        String apiKey = getApiKey();
        if (apiKey.isEmpty()) {
            listener.onError("Add your Gemini API key first, in Luna's settings.");
            return;
        }

        String systemPrompt = ASK_SYSTEM_PROMPT + store.contextBlock() + TOOLS_ADDENDUM;
        JSONArray contents = new JSONArray();

        try {
            contents.put(userTurn(question));

            for (int step = 0; step < MAX_TOOL_STEPS; step++) {
                JSONObject requestBody = new JSONObject();
                requestBody.put("system_instruction", new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", systemPrompt))));
                requestBody.put("contents", contents);
                requestBody.put("tools", new JSONArray().put(new JSONObject().put("function_declarations", ScreenTools.toolDeclarations())));

                JSONObject responseJson = callGemini(apiKey, requestBody);
                JSONObject candidate = responseJson.getJSONArray("candidates").getJSONObject(0);
                JSONArray parts = candidate.getJSONObject("content").getJSONArray("parts");

                JSONArray functionCalls = new JSONArray();
                StringBuilder textReply = new StringBuilder();
                for (int i = 0; i < parts.length(); i++) {
                    JSONObject part = parts.getJSONObject(i);
                    if (part.has("functionCall")) functionCalls.put(part.getJSONObject("functionCall"));
                    else if (part.has("text")) textReply.append(part.getString("text"));
                }

                contents.put(new JSONObject().put("role", "model").put("parts", parts));

                if (functionCalls.length() == 0) {
                    String reply = textReply.toString();
                    if (reply.isEmpty()) reply = "(no reply)";
                    store.logActivity("ask", "Q: " + question + "\nA: " + reply);
                    listener.onReply(reply);
                    return;
                }

                JSONArray responseParts = new JSONArray();
                for (int i = 0; i < functionCalls.length(); i++) {
                    JSONObject call = functionCalls.getJSONObject(i);
                    String name = call.getString("name");
                    JSONObject args = call.optJSONObject("args");
                    if (args == null) args = new JSONObject();

                    listener.onToolStep(describeStep(name, args));
                    JSONObject result = ScreenTools.execute(appContext, name, args);
                    responseParts.put(new JSONObject().put("functionResponse", new JSONObject().put("name", name).put("response", result)));
                }
                // Gemini's current API rejects a "function" role for tool results -
                // function responses go back as a "user" turn instead.
                contents.put(new JSONObject().put("role", "user").put("parts", responseParts));
            }

            String fallback = "That took more steps than I'm allowed - want me to keep going?";
            store.logActivity("ask", "Q: " + question + "\nA: " + fallback);
            listener.onReply(fallback);
        } catch (Exception e) {
            store.logActivity("system", "Error asking Luna: " + e.getMessage());
            listener.onError("Error asking Luna: " + e.getMessage());
        }
    }

    private static String describeStep(String name, JSONObject args) {
        switch (name) {
            case "open_app": return "Opening " + args.optString("app_name", "app") + "...";
            case "show_screen": return "Looking at the screen...";
            case "tap": return "Tapping [" + args.optInt("number", -1) + "]...";
            case "type_text": return "Typing into [" + args.optInt("number", -1) + "]...";
            case "scroll": return "Scrolling " + args.optString("direction", "") + "...";
            case "press_key": return "Pressing " + args.optString("key", "") + "...";
            default: return "Working on it...";
        }
    }

    // ---------- capture (entity extraction into the graph) ----------

    public void capture(String text, CaptureListener listener) {
        String apiKey = getApiKey();
        if (apiKey.isEmpty()) {
            listener.onError("Add your Gemini API key first, in Luna's settings.");
            return;
        }
        if (text == null || text.trim().isEmpty()) {
            listener.onError("Nothing to capture.");
            return;
        }

        try {
            JSONObject requestBody = new JSONObject();
            requestBody.put("system_instruction", new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", EXTRACT_SYSTEM_PROMPT))));
            requestBody.put("contents", new JSONArray().put(userTurn(text)));
            requestBody.put("tools", new JSONArray().put(new JSONObject().put("function_declarations", new JSONArray().put(recordEntitiesDeclaration()))));
            requestBody.put("tool_config", new JSONObject().put("function_calling_config", new JSONObject().put("mode", "ANY")));

            JSONObject responseJson = callGemini(apiKey, requestBody);
            JSONObject candidate = responseJson.getJSONArray("candidates").getJSONObject(0);
            JSONArray parts = candidate.getJSONObject("content").getJSONArray("parts");

            JSONObject args = null;
            for (int i = 0; i < parts.length(); i++) {
                JSONObject part = parts.getJSONObject(i);
                if (part.has("functionCall")) {
                    JSONObject call = part.getJSONObject("functionCall");
                    if ("record_entities".equals(call.optString("name"))) {
                        args = call.optJSONObject("args");
                        break;
                    }
                }
            }

            if (args == null || !args.has("entities") || args.getJSONArray("entities").length() == 0) {
                store.logActivity("capture", "Captured a note — no new entities found.");
                listener.onResult(0, 0);
                return;
            }

            int[] counts = store.mergeExtraction(args);
            store.logActivity("capture", "Captured a note → +" + counts[0] + " entities, +" + counts[1] + " links.");
            listener.onResult(counts[0], counts[1]);
        } catch (Exception e) {
            listener.onError("Error capturing: " + e.getMessage());
        }
    }

    private static JSONObject recordEntitiesDeclaration() throws Exception {
        JSONArray typeEnum = new JSONArray();
        for (String t : GraphStore.TYPES.keySet()) typeEnum.put(t);

        JSONObject entityItem = new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject()
                        .put("label", new JSONObject().put("type", "string").put("description", "Short name, 2-4 words."))
                        .put("type", new JSONObject().put("type", "string").put("enum", typeEnum))
                        .put("note", new JSONObject().put("type", "string").put("description", "One short sentence, optional.")))
                .put("required", new JSONArray().put("label").put("type"));

        JSONObject linkItem = new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject()
                        .put("a", new JSONObject().put("type", "string").put("description", "Label of one entity."))
                        .put("b", new JSONObject().put("type", "string").put("description", "Label of the other entity."))
                        .put("relation", new JSONObject().put("type", "string").put("description", "Short relationship phrase, optional.")))
                .put("required", new JSONArray().put("a").put("b"));

        return new JSONObject()
                .put("name", "record_entities")
                .put("description", "Record the distinct real-world entities and relationships mentioned in a piece of text.")
                .put("parameters", new JSONObject()
                        .put("type", "object")
                        .put("properties", new JSONObject()
                                .put("entities", new JSONObject().put("type", "array").put("items", entityItem))
                                .put("links", new JSONObject().put("type", "array").put("items", linkItem)))
                        .put("required", new JSONArray().put("entities")));
    }

    // ---------- shared HTTP ----------

    private static JSONObject userTurn(String text) throws Exception {
        return new JSONObject().put("role", "user").put("parts", new JSONArray().put(new JSONObject().put("text", text)));
    }

    private JSONObject callGemini(String apiKey, JSONObject requestBody) throws Exception {
        String apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + apiKey;

        URL url = new URL(apiUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(requestBody.toString().getBytes(StandardCharsets.UTF_8));
        }

        int responseCode = conn.getResponseCode();
        Scanner scanner = new Scanner(responseCode == 200 ? conn.getInputStream() : conn.getErrorStream(), "UTF-8");
        StringBuilder responseBuilder = new StringBuilder();
        while (scanner.hasNextLine()) responseBuilder.append(scanner.nextLine());
        scanner.close();

        if (responseCode != 200) throw new Exception("API error (" + responseCode + ") - " + responseBuilder);
        return new JSONObject(responseBuilder.toString());
    }
}
