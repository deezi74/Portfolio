package com.ronnielynch.luna;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.text.method.ScrollingMovementMethod;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Luna - voice + text AI phone assistant. This class is just the chat UI; the
 * actual chat/tool-calling logic lives in {@link LunaBrain} so the
 * always-listening background service can drive it too.
 */
public class MainActivity extends Activity {

    private static final int REQ_RECORD_AUDIO = 100;
    private static final int REQ_SPEECH_INPUT = 200;
    private static final int REQ_RECORD_AUDIO_FOR_ALWAYS_ON = 101;
    private static final int REQ_NOTIFICATIONS = 102;

    private TextView chatText;
    private TextView statusText;
    private ScrollView scrollView;
    private EditText inputBox;
    private TextToSpeech tts;
    private LunaBrain brain;
    private final StringBuilder chatLog = new StringBuilder();
    private boolean busy = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_main);

        brain = new LunaBrain(this);

        chatText = findViewById(R.id.chatText);
        chatText.setMovementMethod(new ScrollingMovementMethod());
        statusText = findViewById(R.id.statusText);
        scrollView = findViewById(R.id.scrollView);
        inputBox = findViewById(R.id.inputBox);
        ImageButton micButton = findViewById(R.id.micButton);
        Button sendButton = findViewById(R.id.sendButton);
        ImageButton settingsButton = findViewById(R.id.settingsButton);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US);
        });

        sendButton.setOnClickListener(v -> sendCurrentInput());
        micButton.setOnClickListener(v -> startVoiceInput());
        settingsButton.setOnClickListener(v -> showSettingsDialog());

        restoreHistory();
        if (brain.getApiKey().isEmpty()) {
            appendChat("Luna: Add your Gemini API key (gear icon, top right) to start chatting.");
            showSettingsDialog();
        }

        if (brain.isAlwaysListening()) {
            ensureAlwaysListeningRunning();
        }
    }

    // ---------- restoring history ----------

    private void restoreHistory() {
        JSONArray display = brain.getDisplayableHistory();
        for (int i = 0; i < display.length(); i++) {
            try {
                JSONObject turn = display.getJSONObject(i);
                String role = turn.getString("role");
                String text = turn.getString("text");
                appendChat(("user".equals(role) ? "You: " : "Luna: ") + text);
            } catch (Exception ignored) {
            }
        }
        if (display.length() > 0) {
            appendChat("— restored from your last conversation —");
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
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
            return;
        }
        launchSpeechRecognizer();
    }

    private void launchSpeechRecognizer() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
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
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        if (requestCode == REQ_RECORD_AUDIO && granted) {
            launchSpeechRecognizer();
        } else if (requestCode == REQ_RECORD_AUDIO_FOR_ALWAYS_ON) {
            if (granted) {
                requestNotificationsThenStartAlwaysListening();
            } else {
                Toast.makeText(this, "Always-listening needs microphone access.", Toast.LENGTH_SHORT).show();
            }
        } else if (requestCode == REQ_NOTIFICATIONS) {
            ensureAlwaysListeningRunning();
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

    private void showSettingsDialog() {
        int pad = (int) (16 * getResources().getDisplayMetrics().density);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(pad, pad, pad, pad);

        EditText keyInput = new EditText(this);
        keyInput.setHint("Gemini API key (AIza...)");
        keyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        keyInput.setText(brain.getApiKey());
        layout.addView(keyInput);

        TextView keyHelp = new TextView(this);
        keyHelp.setText("Stored only on this device. Get one at aistudio.google.com/apikey");
        keyHelp.setTextSize(12);
        keyHelp.setPadding(0, 4, 0, pad);
        layout.addView(keyHelp);

        Switch alwaysListenSwitch = new Switch(this);
        alwaysListenSwitch.setText("Always listen for “Luna”");
        alwaysListenSwitch.setChecked(brain.isAlwaysListening());
        layout.addView(alwaysListenSwitch);

        TextView alwaysHelp = new TextView(this);
        alwaysHelp.setText("Keeps the mic listening in the background, with an always-on notification while it's active. Uses more battery.");
        alwaysHelp.setTextSize(12);
        alwaysHelp.setPadding(0, 4, 0, pad);
        layout.addView(alwaysHelp);

        Switch muteSwitch = new Switch(this);
        muteSwitch.setText("Mute Luna's voice");
        muteSwitch.setChecked(brain.isMuted());
        muteSwitch.setPadding(0, 0, 0, pad);
        layout.addView(muteSwitch);

        Button screenControlButton = new Button(this);
        screenControlButton.setText(isAccessibilityServiceEnabled()
                ? "Screen control: ON (tap to manage)"
                : "Enable screen control...");
        screenControlButton.setOnClickListener(v -> openAccessibilitySettings());
        layout.addView(screenControlButton);

        TextView screenHelp = new TextView(this);
        screenHelp.setText("Lets Luna tap, type, and scroll for you (e.g. “go to YouTube and search cat videos”). Turned on manually in Android's Accessibility settings, for your safety.");
        screenHelp.setTextSize(12);
        screenHelp.setPadding(0, 4, 0, pad);
        layout.addView(screenHelp);

        Button clearHistoryButton = new Button(this);
        clearHistoryButton.setText("Clear chat history");
        clearHistoryButton.setOnClickListener(v -> {
            brain.clearHistory();
            chatLog.setLength(0);
            chatText.setText("");
            Toast.makeText(this, "Chat history cleared", Toast.LENGTH_SHORT).show();
        });
        layout.addView(clearHistoryButton);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);

        new AlertDialog.Builder(this)
                .setTitle("Luna settings")
                .setView(scroll)
                .setPositiveButton("Save", (dialog, which) -> {
                    String key = keyInput.getText().toString().trim();
                    brain.setApiKey(key);
                    brain.setMuted(muteSwitch.isChecked());

                    boolean wantsAlwaysListening = alwaysListenSwitch.isChecked();
                    brain.setAlwaysListening(wantsAlwaysListening);
                    if (wantsAlwaysListening) {
                        requestRecordAudioThenStartAlwaysListening();
                    } else {
                        LunaWakeWordService.stop(this);
                    }

                    if (!key.isEmpty()) appendChat("Luna: Settings saved.");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void requestRecordAudioThenStartAlwaysListening() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO_FOR_ALWAYS_ON);
        } else {
            requestNotificationsThenStartAlwaysListening();
        }
    }

    private void requestNotificationsThenStartAlwaysListening() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            ensureAlwaysListeningRunning();
        }
    }

    private void ensureAlwaysListeningRunning() {
        LunaWakeWordService.start(this);
    }

    private boolean isAccessibilityServiceEnabled() {
        AccessibilityManager am = (AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null) return false;
        List<AccessibilityServiceInfo> enabled =
                am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        for (AccessibilityServiceInfo info : enabled) {
            if (getPackageName().equals(info.getResolveInfo().serviceInfo.packageName)) return true;
        }
        return false;
    }

    private void openAccessibilitySettings() {
        Toast.makeText(this, "Find “Luna” in the list and turn it on", Toast.LENGTH_LONG).show();
        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    // ---------- talking to Luna ----------

    private void sendToLuna(String userMessage) {
        if (brain.getApiKey().isEmpty()) {
            appendChat("Luna: Add your Gemini API key first (gear icon, top right).");
            showSettingsDialog();
            return;
        }

        appendChat("You: " + userMessage);
        setBusy(true, "Thinking...");

        new Thread(() -> brain.processUserMessage(userMessage, new LunaBrain.Listener() {
            @Override
            public void onToolStep(String description) {
                runOnUiThread(() -> setBusy(true, description));
            }

            @Override
            public void onReply(String text) {
                runOnUiThread(() -> {
                    appendChat("Luna: " + text);
                    setBusy(false, "Tap the mic and say ‘Luna’, or type below");
                    speak(text);
                });
            }

            @Override
            public void onError(String text) {
                runOnUiThread(() -> {
                    appendChat("Luna: " + text);
                    setBusy(false, "Tap the mic and say ‘Luna’, or type below");
                });
            }
        })).start();
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
        if (tts != null && !brain.isMuted()) {
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
