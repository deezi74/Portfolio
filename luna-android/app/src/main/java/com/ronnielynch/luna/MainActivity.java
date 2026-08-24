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
import android.view.KeyEvent;
import android.view.View;
import android.view.accessibility.AccessibilityManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Luna - a live personal knowledge-graph assistant. This class is just the
 * UI shell: the graph lives in {@link GraphStore}/{@link GraphView} and the
 * chat/tool-calling logic lives in {@link LunaBrain}, so the always-listening
 * background service can drive the same brain without this Activity running.
 */
public class MainActivity extends Activity {

    private static final int REQ_RECORD_AUDIO = 100;
    private static final int REQ_SPEECH_INPUT = 200;
    private static final int REQ_RECORD_AUDIO_FOR_ALWAYS_ON = 101;
    private static final int REQ_NOTIFICATIONS = 102;

    private GraphView graphView;
    private TextView knowledgeSub, physicsLabel, systemsLabel, orbLabel;
    private EditText askInput;
    private ImageButton micButton, orbButton;

    private TextToSpeech tts;
    private LunaBrain brain;
    private boolean busy = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        brain = new LunaBrain(this);

        graphView = findViewById(R.id.graphView);
        knowledgeSub = findViewById(R.id.knowledgeSub);
        physicsLabel = findViewById(R.id.physicsLabel);
        systemsLabel = findViewById(R.id.systemsLabel);
        orbLabel = findViewById(R.id.orbLabel);
        askInput = findViewById(R.id.askInput);
        micButton = findViewById(R.id.micButton);
        orbButton = findViewById(R.id.orbButton);

        ImageButton settingsButton = findViewById(R.id.settingsButton);
        Button filterButton = findViewById(R.id.filterButton);
        Button zoomInButton = findViewById(R.id.zoomInButton);
        Button zoomOutButton = findViewById(R.id.zoomOutButton);
        Button zoomFitButton = findViewById(R.id.zoomFitButton);
        Button traceButton = findViewById(R.id.traceButton);
        Button activityButton = findViewById(R.id.activityButton);
        Button captureButton = findViewById(R.id.captureButton);
        Button systemButton = findViewById(R.id.systemButton);

        graphView.setStatsListener(this::refreshStats);
        graphView.setStore(brain.getStore());
        graphView.setOnNodeSelectedListener(new GraphView.OnNodeSelectedListener() {
            @Override
            public void onNodeSelected(String type, String label, String note, float screenX, float screenY) {
                String msg = label + " · " + type + (note != null && !note.isEmpty() ? "\n" + note : "");
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
            @Override
            public void onNodeDeselected() { }
        });

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US);
        });

        settingsButton.setOnClickListener(v -> showSettingsDialog());
        systemButton.setOnClickListener(v -> showSettingsDialog());
        filterButton.setOnClickListener(v -> showFilterDialog());
        zoomInButton.setOnClickListener(v -> graphView.zoomBy(1.25f));
        zoomOutButton.setOnClickListener(v -> graphView.zoomBy(0.8f));
        zoomFitButton.setOnClickListener(v -> graphView.fitToScreen());
        traceButton.setOnClickListener(v -> showActivityDialog());
        activityButton.setOnClickListener(v -> showActivityDialog());
        captureButton.setOnClickListener(v -> showCaptureDialog());
        micButton.setOnClickListener(v -> startVoiceInput());
        orbButton.setOnClickListener(v -> startVoiceInput());

        askInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                submitAsk();
                return true;
            }
            return false;
        });

        refreshStats();
        graphView.post(graphView::fitToScreen);

        if (!brain.isConfigured()) {
            systemsLabel.setText(brain.configurationHint());
            showSettingsDialog();
        }

        if (brain.isAlwaysListening()) {
            ensureAlwaysListeningRunning();
        }
    }

    // ---------- stats ----------

    private void refreshStats() {
        GraphStore store = brain.getStore();
        Set<String> domains = new HashSet<>();
        for (GraphStore.Entity e : store.entities) domains.add(e.type);
        knowledgeSub.setText(domains.size() + " domain" + (domains.size() == 1 ? "" : "s")
                + " · " + store.entities.size() + " live entit" + (store.entities.size() == 1 ? "y" : "ies"));
        physicsLabel.setText("LIVE PHYSICS — " + graphView.visibleNodeCount() + " nodes · " + graphView.visibleLinkCount() + " links");
    }

    // ---------- ask / voice input ----------

    private void submitAsk() {
        String text = askInput.getText().toString().trim();
        if (text.isEmpty() || busy) return;
        askInput.setText("");
        sendAsk(text);
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
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask Luna...");
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
            if (granted) requestNotificationsThenStartAlwaysListening();
            else Toast.makeText(this, "Always-listening needs microphone access.", Toast.LENGTH_SHORT).show();
        } else if (requestCode == REQ_NOTIFICATIONS) {
            ensureAlwaysListeningRunning();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SPEECH_INPUT && resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) sendAsk(results.get(0));
        }
    }

    private void sendAsk(String question) {
        if (!brain.isConfigured()) {
            Toast.makeText(this, brain.configurationHint(), Toast.LENGTH_SHORT).show();
            showSettingsDialog();
            return;
        }

        setBusy(true, "THINKING");
        new Thread(() -> brain.ask(question, new LunaBrain.Listener() {
            @Override
            public void onToolStep(String description) {
                runOnUiThread(() -> setBusy(true, "THINKING"));
            }

            @Override
            public void onReply(String text) {
                runOnUiThread(() -> {
                    setBusy(false, "READY");
                    Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show();
                    speak(text);
                });
            }

            @Override
            public void onError(String text) {
                runOnUiThread(() -> {
                    setBusy(false, "READY");
                    Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show();
                });
            }
        })).start();
    }

    private void setBusy(boolean value, String orbState) {
        busy = value;
        orbLabel.setText(orbState);
    }

    // ---------- filter dialog ----------

    private void showFilterDialog() {
        GraphStore store = brain.getStore();
        java.util.Map<String, Integer> counts = new java.util.LinkedHashMap<>();
        for (GraphStore.Entity e : store.entities) counts.merge(e.type, 1, Integer::sum);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        layout.setPadding(pad, pad, pad, pad);

        for (java.util.Map.Entry<String, GraphStore.TypeMeta> entry : GraphStore.TYPES.entrySet()) {
            String type = entry.getKey();
            Integer count = counts.get(type);
            if (count == null) continue;
            GraphStore.TypeMeta meta = entry.getValue();

            CheckBox cb = new CheckBox(this);
            cb.setText(meta.icon + "  " + meta.label + " (" + count + ")");
            cb.setChecked(graphView.isTypeVisible(type));
            cb.setOnCheckedChangeListener((btn, checked) -> {
                graphView.setTypeVisible(type, checked);
                refreshStats();
            });
            layout.addView(cb);
        }

        new AlertDialog.Builder(this)
                .setTitle("Filter entities")
                .setView(layout)
                .setPositiveButton("Done", null)
                .show();
    }

    // ---------- activity / trace dialog ----------

    private void showActivityDialog() {
        List<GraphStore.ActivityItem> items = brain.getStore().activity;

        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        layout.setPadding(pad, pad, pad, pad);
        scroll.addView(layout);

        if (items.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("Nothing yet — capture something or ask Luna a question.");
            layout.addView(empty);
        } else {
            DateFormat fmt = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT);
            for (GraphStore.ActivityItem item : items) {
                TextView tv = new TextView(this);
                tv.setText(item.kind.toUpperCase(Locale.US) + " · " + fmt.format(new java.util.Date(item.at)) + "\n" + item.text);
                tv.setPadding(0, 0, 0, dp(14));
                layout.addView(tv);
            }
        }

        new AlertDialog.Builder(this)
                .setTitle("Activity")
                .setView(scroll)
                .setPositiveButton("Close", null)
                .show();
    }

    // ---------- capture dialog ----------

    private void showCaptureDialog() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        layout.setPadding(pad, pad, pad, pad);

        TextView help = new TextView(this);
        help.setText("Paste a note, contact, or document excerpt. Luna reads it and adds what it mentions to your knowledge graph.");
        help.setPadding(0, 0, 0, dp(10));
        layout.addView(help);

        EditText input = new EditText(this);
        input.setHint("Paste or type something for Luna to learn...");
        input.setMinLines(4);
        input.setGravity(android.view.Gravity.TOP);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        layout.addView(input);

        TextView status = new TextView(this);
        status.setPadding(0, dp(10), 0, 0);
        layout.addView(status);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Capture")
                .setView(layout)
                .setPositiveButton("Capture", null)
                .setNegativeButton("Close", null)
                .show();

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String text = input.getText().toString().trim();
            if (text.isEmpty()) return;
            if (!brain.isConfigured()) {
                status.setText(brain.configurationHint());
                return;
            }
            status.setText("Reading...");
            new Thread(() -> brain.capture(text, new LunaBrain.CaptureListener() {
                @Override
                public void onResult(int addedEntities, int addedLinks) {
                    runOnUiThread(() -> {
                        graphView.rebuildFromStore();
                        refreshStats();
                        if (addedEntities == 0) {
                            status.setText("Luna didn't find anything to remember in that.");
                        } else {
                            status.setText("Found " + addedEntities + " new entit" + (addedEntities == 1 ? "y" : "ies")
                                    + " and " + addedLinks + " link" + (addedLinks == 1 ? "" : "s") + ".");
                            input.setText("");
                        }
                    });
                }

                @Override
                public void onError(String text2) {
                    runOnUiThread(() -> status.setText(text2));
                }
            })).start();
        });
    }

    // ---------- settings ----------

    private void showSettingsDialog() {
        int pad = dp(16);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(pad, pad, pad, pad);

        TextView providerLabel = new TextView(this);
        providerLabel.setText("AI provider");
        providerLabel.setTextSize(12);
        layout.addView(providerLabel);

        RadioGroup providerGroup = new RadioGroup(this);
        providerGroup.setOrientation(RadioGroup.VERTICAL);

        RadioButton cloudRadio = new RadioButton(this);
        cloudRadio.setId(View.generateViewId());
        cloudRadio.setText("Cloud (Gemini) — needs a free API key");
        providerGroup.addView(cloudRadio);

        RadioButton localRadio = new RadioButton(this);
        localRadio.setId(View.generateViewId());
        localRadio.setText("Local model on this device — no API key");
        providerGroup.addView(localRadio);

        providerGroup.check(brain.isLocalProvider() ? localRadio.getId() : cloudRadio.getId());
        providerGroup.setPadding(0, 0, 0, dp(8));
        layout.addView(providerGroup);

        // ---- cloud (Gemini) fields ----
        LinearLayout cloudSection = new LinearLayout(this);
        cloudSection.setOrientation(LinearLayout.VERTICAL);

        EditText keyInput = new EditText(this);
        keyInput.setHint("Gemini API key (AIza...)");
        keyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        keyInput.setText(brain.getApiKey());
        cloudSection.addView(keyInput);

        TextView keyHelp = new TextView(this);
        keyHelp.setText("Stored only on this device. Get one at aistudio.google.com/apikey");
        keyHelp.setTextSize(12);
        keyHelp.setPadding(0, 4, 0, pad);
        cloudSection.addView(keyHelp);
        layout.addView(cloudSection);

        // ---- local model fields ----
        LinearLayout localSection = new LinearLayout(this);
        localSection.setOrientation(LinearLayout.VERTICAL);

        EditText localUrlInput = new EditText(this);
        localUrlInput.setHint("Server URL");
        localUrlInput.setText(brain.getLocalUrl());
        localSection.addView(localUrlInput);

        EditText localModelInput = new EditText(this);
        localModelInput.setHint("Model name (e.g. llama3.2:3b)");
        localModelInput.setText(brain.getLocalModel());
        localModelInput.setPadding(0, dp(6), 0, 0);
        localSection.addView(localModelInput);

        TextView localHelp = new TextView(this);
        localHelp.setText("Talks to an Ollama-compatible server already running with a model you've " +
                "pulled - on this phone (e.g. via Termux) or another device on your network. Nothing " +
                "leaves your network, no key needed. Screen-control tools aren't available in local " +
                "mode yet - just Q&A and knowledge capture.");
        localHelp.setTextSize(12);
        localHelp.setPadding(0, 4, 0, pad);
        localSection.addView(localHelp);
        layout.addView(localSection);

        Runnable updateProviderSections = () -> {
            boolean local = providerGroup.getCheckedRadioButtonId() == localRadio.getId();
            cloudSection.setVisibility(local ? View.GONE : View.VISIBLE);
            localSection.setVisibility(local ? View.VISIBLE : View.GONE);
        };
        updateProviderSections.run();
        providerGroup.setOnCheckedChangeListener((group, checkedId) -> updateProviderSections.run());

        Switch alwaysListenSwitch = new Switch(this);
        alwaysListenSwitch.setText("Always listen for “Luna”");
        alwaysListenSwitch.setChecked(brain.isAlwaysListening());
        layout.addView(alwaysListenSwitch);

        TextView alwaysHelp = new TextView(this);
        alwaysHelp.setText("Keeps the mic listening in the background, with an always-on notification while active. Uses more battery.");
        alwaysHelp.setTextSize(12);
        alwaysHelp.setPadding(0, 4, 0, pad);
        layout.addView(alwaysHelp);

        Switch muteSwitch = new Switch(this);
        muteSwitch.setText("Mute Luna's voice");
        muteSwitch.setChecked(brain.isMuted());
        muteSwitch.setPadding(0, 0, 0, pad);
        layout.addView(muteSwitch);

        Button screenControlButton = new Button(this);
        screenControlButton.setText(isAccessibilityServiceEnabled() ? "Screen control: ON (tap to manage)" : "Enable screen control...");
        screenControlButton.setOnClickListener(v -> openAccessibilitySettings());
        layout.addView(screenControlButton);

        TextView screenHelp = new TextView(this);
        screenHelp.setText("Lets Luna tap, type, and scroll for you (e.g. “go to YouTube and search cat videos”). Turned on manually in Android's Accessibility settings, for your safety.");
        screenHelp.setTextSize(12);
        screenHelp.setPadding(0, 4, 0, pad);
        layout.addView(screenHelp);

        Button clearGraphButton = new Button(this);
        clearGraphButton.setText("Clear knowledge graph");
        clearGraphButton.setOnClickListener(v -> {
            brain.getStore().clearGraph();
            graphView.rebuildFromStore();
            refreshStats();
            Toast.makeText(this, "Knowledge graph cleared", Toast.LENGTH_SHORT).show();
        });
        layout.addView(clearGraphButton);

        Button clearActivityButton = new Button(this);
        clearActivityButton.setText("Clear activity history");
        clearActivityButton.setOnClickListener(v -> {
            brain.getStore().clearActivity();
            Toast.makeText(this, "Activity history cleared", Toast.LENGTH_SHORT).show();
        });
        layout.addView(clearActivityButton);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);

        new AlertDialog.Builder(this)
                .setTitle("Luna settings")
                .setView(scroll)
                .setPositiveButton("Save", (dialog, which) -> {
                    String key = keyInput.getText().toString().trim();
                    brain.setApiKey(key);
                    brain.setLocalUrl(localUrlInput.getText().toString().trim());
                    brain.setLocalModel(localModelInput.getText().toString().trim());
                    brain.setProvider(providerGroup.getCheckedRadioButtonId() == localRadio.getId()
                            ? LunaBrain.PROVIDER_LOCAL : LunaBrain.PROVIDER_GEMINI);
                    brain.setMuted(muteSwitch.isChecked());
                    systemsLabel.setText(brain.isConfigured() ? "All systems connected" : brain.configurationHint());

                    boolean wantsAlwaysListening = alwaysListenSwitch.isChecked();
                    brain.setAlwaysListening(wantsAlwaysListening);
                    if (wantsAlwaysListening) requestRecordAudioThenStartAlwaysListening();
                    else LunaWakeWordService.stop(this);
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
        List<AccessibilityServiceInfo> enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        for (AccessibilityServiceInfo info : enabled) {
            if (getPackageName().equals(info.getResolveInfo().serviceInfo.packageName)) return true;
        }
        return false;
    }

    private void openAccessibilitySettings() {
        Toast.makeText(this, "Find “Luna” in the list and turn it on", Toast.LENGTH_LONG).show();
        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    // ---------- helpers ----------

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
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
