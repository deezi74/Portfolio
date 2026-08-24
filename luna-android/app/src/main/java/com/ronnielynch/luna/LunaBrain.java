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
 * Luna's "brain": owns the chat history, talks to the Gemini API, and drives
 * the tool-calling loop that lets Luna control the phone through
 * {@link LunaAccessibilityService}.
 *
 * This class has no Activity/UI dependency so both {@link MainActivity} (typed
 * or tapped-mic input) and {@link LunaWakeWordService} (wake-word triggered,
 * app not necessarily in the foreground) can drive the same assistant.
 */
public class LunaBrain {

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_API_KEY = "gemini_api_key";
    private static final String PREF_MUTED = "muted";
    private static final String PREF_ALWAYS_LISTENING = "always_listening";
    private static final String PREF_HISTORY = "chat_history_json";

    private static final String MODEL = "gemini-2.0-flash";
    private static final String SYSTEM_PROMPT =
            "You are Luna, a warm, concise AI phone assistant running natively on the " +
            "user's Android phone. Keep spoken replies short and conversational.\n\n" +
            "You can also control the phone's screen using tools: open_app, show_screen, " +
            "tap, type_text, scroll and press_key. When a request needs you to do something " +
            "on screen (open an app, search for something, tap a result, fill in a field), " +
            "follow this pattern: call open_app if you need a different app in front; call " +
            "show_screen to see the numbered, tappable elements currently on screen; then use " +
            "tap/type_text/scroll/press_key by their number. Always call show_screen again " +
            "after an action if you're not sure what changed - numbers are only valid for the " +
            "most recent show_screen call. If screen control tools fail because it isn't " +
            "enabled yet, tell the user to enable 'Screen control' in Luna's settings.";

    private static final int MAX_TOOL_STEPS = 8;
    private static final int MAX_STORED_TURNS = 60;

    public interface Listener {
        /** A tool call is about to run, e.g. "Opening YouTube..." */
        void onToolStep(String description);
        /** Luna's final reply for this turn, ready to display and speak. */
        void onReply(String text);
        /** Something went wrong; text is safe to show the user. */
        void onError(String text);
    }

    private final Context appContext;
    private final SharedPreferences prefs;

    public LunaBrain(Context context) {
        this.appContext = context.getApplicationContext();
        this.prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public String getApiKey() {
        return prefs.getString(PREF_API_KEY, "");
    }

    public void setApiKey(String key) {
        prefs.edit().putString(PREF_API_KEY, key).apply();
    }

    public boolean isMuted() {
        return prefs.getBoolean(PREF_MUTED, false);
    }

    public void setMuted(boolean muted) {
        prefs.edit().putBoolean(PREF_MUTED, muted).apply();
    }

    public boolean isAlwaysListening() {
        return prefs.getBoolean(PREF_ALWAYS_LISTENING, false);
    }

    public void setAlwaysListening(boolean value) {
        prefs.edit().putBoolean(PREF_ALWAYS_LISTENING, value).apply();
    }

    public void clearHistory() {
        prefs.edit().remove(PREF_HISTORY).apply();
    }

    public boolean isScreenControlEnabled() {
        return LunaAccessibilityService.getInstance() != null;
    }

    private JSONArray loadHistory() {
        try {
            String raw = prefs.getString(PREF_HISTORY, "[]");
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private void saveHistory(JSONArray history) {
        // Keep the stored log from growing forever - trim from the oldest end.
        while (history.length() > MAX_STORED_TURNS) {
            history.remove(0);
        }
        prefs.edit().putString(PREF_HISTORY, history.toString()).apply();
    }

    /** Rebuilds the visible chat log (role + first text part) for restoring the UI on launch. */
    public JSONArray getDisplayableHistory() {
        JSONArray out = new JSONArray();
        JSONArray history = loadHistory();
        for (int i = 0; i < history.length(); i++) {
            try {
                JSONObject turn = history.getJSONObject(i);
                String role = turn.optString("role");
                if (!"user".equals(role) && !"model".equals(role)) continue;
                JSONArray parts = turn.optJSONArray("parts");
                if (parts == null) continue;
                for (int p = 0; p < parts.length(); p++) {
                    JSONObject part = parts.getJSONObject(p);
                    if (part.has("text")) {
                        out.put(new JSONObject().put("role", role).put("text", part.getString("text")));
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    /**
     * Runs one full turn: send the user's message, follow any tool calls Luna
     * makes, and report the final reply. Blocks the calling thread - call
     * this from a background thread.
     */
    public void processUserMessage(String userMessage, Listener listener) {
        String apiKey = getApiKey();
        if (apiKey.isEmpty()) {
            listener.onError("Add your Gemini API key first, in Luna's settings.");
            return;
        }

        JSONArray history = loadHistory();
        history.put(userTurn(userMessage));

        try {
            for (int step = 0; step < MAX_TOOL_STEPS; step++) {
                JSONObject responseJson = callGemini(apiKey, history);

                JSONObject candidate = responseJson.getJSONArray("candidates").getJSONObject(0);
                JSONArray parts = candidate.getJSONObject("content").getJSONArray("parts");

                JSONArray functionCalls = new JSONArray();
                StringBuilder textReply = new StringBuilder();
                for (int i = 0; i < parts.length(); i++) {
                    JSONObject part = parts.getJSONObject(i);
                    if (part.has("functionCall")) {
                        functionCalls.put(part.getJSONObject("functionCall"));
                    } else if (part.has("text")) {
                        textReply.append(part.getString("text"));
                    }
                }

                // Record the model's turn (function call(s) or plain text) as-is.
                history.put(new JSONObject().put("role", "model").put("parts", parts));

                if (functionCalls.length() == 0) {
                    String reply = textReply.toString();
                    saveHistory(history);
                    listener.onReply(reply.isEmpty() ? "(no reply)" : reply);
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

                    responseParts.put(new JSONObject().put("functionResponse",
                            new JSONObject().put("name", name).put("response", result)));
                }
                history.put(new JSONObject().put("role", "function").put("parts", responseParts));
            }

            saveHistory(history);
            listener.onReply("That took more steps than I'm allowed - want me to keep going?");
        } catch (Exception e) {
            saveHistory(history);
            listener.onError("Error talking to Luna: " + e.getMessage());
        }
    }

    private static JSONObject userTurn(String text) throws Exception {
        return new JSONObject()
                .put("role", "user")
                .put("parts", new JSONArray().put(new JSONObject().put("text", text)));
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

    private JSONObject callGemini(String apiKey, JSONArray history) throws Exception {
        JSONObject requestBody = new JSONObject();
        requestBody.put("system_instruction",
                new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", SYSTEM_PROMPT))));
        requestBody.put("contents", history);
        requestBody.put("tools", new JSONArray().put(new JSONObject().put("function_declarations", ScreenTools.toolDeclarations())));

        String apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/"
                + MODEL + ":generateContent?key=" + apiKey;

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
        Scanner scanner = new Scanner(
                responseCode == 200 ? conn.getInputStream() : conn.getErrorStream(), "UTF-8");
        StringBuilder responseBuilder = new StringBuilder();
        while (scanner.hasNextLine()) responseBuilder.append(scanner.nextLine());
        scanner.close();

        if (responseCode != 200) {
            throw new Exception("API error (" + responseCode + ") - " + responseBuilder);
        }
        return new JSONObject(responseBuilder.toString());
    }
}
