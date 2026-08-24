package com.ronnielynch.luna;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.text.method.ScrollingMovementMethod;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Scanner;

/**
 * Luna - a simple voice + text AI phone assistant backed by the Gemini API.
 *
 * The API key is never hardcoded: it's entered by the user via the settings
 * (gear) button and stored in a private SharedPreferences file on-device.
 */
public class MainActivity extends Activity {

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_API_KEY = "gemini_api_key";
    private static final String MODEL = "gemini-2.0-flash";
    private static final String SYSTEM_PROMPT =
            "You are Luna, a warm, concise AI phone assistant. Keep answers short " +
            "and conversational, the way you'd speak on a phone call, unless the " +
            "user asks for detail.";
    private static final int REQ_RECORD_AUDIO = 100;
    private static final int REQ_SPEECH_INPUT = 200;

    private TextView chatText;
    private TextView statusText;
    private ScrollView scrollView;
    private EditText inputBox;
    private ImageButton micButton;
    private TextToSpeech tts;
    private SharedPreferences prefs;
    private final StringBuilder chatLog = new StringBuilder();
    private final List<JSONObject> history = new ArrayList<>();
    private boolean busy = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        chatText = findViewById(R.id.chatText);
        chatText.setMovementMethod(new ScrollingMovementMethod());
        statusText = findViewById(R.id.statusText);
        scrollView = findViewById(R.id.scrollView);
        inputBox = findViewById(R.id.inputBox);
        micButton = findViewById(R.id.micButton);
        Button sendButton = findViewById(R.id.sendButton);
        ImageButton settingsButton = findViewById(R.id.settingsButton);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.US);
            }
        });

        sendButton.setOnClickListener(v -> sendCurrentInput());
        micButton.setOnClickListener(v -> startVoiceInput());
        settingsButton.setOnClickListener(v -> showSettingsDialog());

        if (getApiKey().isEmpty()) {
            appendChat("Luna: Add your Gemini API key (gear icon, top right) to start chatting.");
            showSettingsDialog();
        } else {
            appendChat("Luna: Hi, I'm Luna. Ask me anything, out loud or by typing.");
        }
    }

    // ---------- input handling ----------

    private void sendCurrentInput() {
        String message = inputBox.getText().toString().trim();
        if (message.isEmpty() || busy) return;
        inputBox.setText("");
        sendToLuna(message);
    }

    private void startVoiceInput() {
        if (busy) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
            return;
        }
        launchSpeechRecognizer();
    }

    private void launchSpeechRecognizer() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to Luna...");
        try {
            startActivityForResult(intent, REQ_SPEECH_INPUT);
        } catch (Exception e) {
            Toast.makeText(this, "No speech recognizer available on this device", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            launchSpeechRecognizer();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SPEECH_INPUT && resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) {
                sendToLuna(results.get(0));
            }
        }
    }

    // ---------- settings ----------

    private String getApiKey() {
        return prefs.getString(PREF_API_KEY, "");
    }

    private void showSettingsDialog() {
        EditText keyInput = new EditText(this);
        keyInput.setHint("Gemini API key (AIza...)");
        keyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        keyInput.setText(getApiKey());

        new AlertDialog.Builder(this)
                .setTitle("Luna settings")
                .setMessage("Paste your free Gemini API key. It's stored only on this device.\n\n" +
                        "Get one at aistudio.google.com/apikey")
                .setView(keyInput)
                .setPositiveButton("Save", (dialog, which) -> {
                    String key = keyInput.getText().toString().trim();
                    prefs.edit().putString(PREF_API_KEY, key).apply();
                    if (!key.isEmpty()) {
                        appendChat("Luna: API key saved.");
                    }
                })
                .setNegativeButton("Clear key", (dialog, which) -> {
                    prefs.edit().remove(PREF_API_KEY).apply();
                    appendChat("Luna: API key cleared.");
                })
                .setNeutralButton("Cancel", null)
                .show();
    }

    // ---------- Gemini call ----------

    private void sendToLuna(String userMessage) {
        String apiKey = getApiKey();
        if (apiKey.isEmpty()) {
            appendChat("Luna: Add your Gemini API key first (gear icon, top right).");
            showSettingsDialog();
            return;
        }

        appendChat("You: " + userMessage);
        addToHistory("user", userMessage);
        setBusy(true, "Thinking...");

        new Thread(() -> callGeminiApi(apiKey)).start();
    }

    private void addToHistory(String role, String text) {
        try {
            JSONObject part = new JSONObject().put("text", text);
            JSONObject turn = new JSONObject()
                    .put("role", role)
                    .put("parts", new JSONArray().put(part));
            history.add(turn);
        } catch (Exception ignored) {
        }
    }

    private void callGeminiApi(String apiKey) {
        try {
            JSONObject requestBody = new JSONObject();
            requestBody.put("system_instruction",
                    new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", SYSTEM_PROMPT))));

            JSONArray contentsArray = new JSONArray();
            for (JSONObject turn : history) contentsArray.put(turn);
            requestBody.put("contents", contentsArray);

            String apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/"
                    + MODEL + ":generateContent?key=" + apiKey;

            URL url = new URL(apiUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(requestBody.toString().getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            Scanner scanner = new Scanner(
                    responseCode == 200 ? conn.getInputStream() : conn.getErrorStream(),
                    "UTF-8");
            StringBuilder responseBuilder = new StringBuilder();
            while (scanner.hasNextLine()) {
                responseBuilder.append(scanner.nextLine());
            }
            scanner.close();

            if (responseCode != 200) {
                history.remove(history.size() - 1);
                postToUi("Luna: API error (" + responseCode + ") - " + responseBuilder, null);
                return;
            }

            JSONObject responseJson = new JSONObject(responseBuilder.toString());
            String replyText = responseJson
                    .getJSONArray("candidates")
                    .getJSONObject(0)
                    .getJSONObject("content")
                    .getJSONArray("parts")
                    .getJSONObject(0)
                    .getString("text");

            addToHistory("model", replyText);
            postToUi("Luna: " + replyText, replyText);

        } catch (Exception e) {
            if (!history.isEmpty()) history.remove(history.size() - 1);
            postToUi("Luna: Error - " + e.getMessage(), null);
        }
    }

    private void postToUi(String chatLine, String speakText) {
        new Handler(Looper.getMainLooper()).post(() -> {
            appendChat(chatLine);
            setBusy(false, "Tap the mic and say ‘Luna’, or type below");
            if (speakText != null) speak(speakText);
        });
    }

    // ---------- UI helpers ----------

    private void setBusy(boolean value, String status) {
        busy = value;
        statusText.setText(status);
    }

    private void appendChat(String line) {
        chatLog.append(line).append("\n\n");
        chatText.setText(chatLog.toString());
        scrollView.post(() -> scrollView.fullScroll(View.FOCUS_DOWN));
    }

    private void speak(String text) {
        if (tts != null) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna_reply");
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
