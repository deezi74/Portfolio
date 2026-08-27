package com.ronnielynch.luna;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.view.Gravity;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
    private static final int REQ_PICK_MODEL_FILE = 103;
    private static final int REQ_PHONE_PERMISSIONS = 104;
    private static final int REQ_BLUETOOTH = 105;
    private static final int REQ_IMAGE_CAPTURE = 106;

    private GraphView graphView;
    private TextView knowledgeSub, physicsLabel, systemsLabel, orbLabel;
    private EditText askInput;
    private ImageButton micButton, orbButton;

    // Set while the settings dialog is open, so copyModelFile() (called from onActivityResult,
    // after the file picker returns) can update it live - the dialog survives the picker
    // activity being launched on top, it just gets obscured and reappears.
    private TextView localFileStatusText;

    // Same pattern, for the capture dialog's status line and a pending camera capture.
    private TextView captureStatusText;
    private Uri pendingPhotoUri;

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
        } else if (requestCode == REQ_IMAGE_CAPTURE) {
            if (granted) takeCapturePhoto();
            else Toast.makeText(this, "Photo capture needs Camera access.", Toast.LENGTH_SHORT).show();
        }
        // REQ_PHONE_PERMISSIONS / REQ_BLUETOOTH: no follow-up action needed here - the
        // corresponding Settings button just reflects the new state next time it's shown.
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SPEECH_INPUT && resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) sendAsk(results.get(0));
        } else if (requestCode == REQ_PICK_MODEL_FILE && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) copyModelFile(uri);
        } else if (requestCode == REQ_IMAGE_CAPTURE && resultCode == RESULT_OK) {
            handleCapturedPhoto();
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
        help.setText("Paste a note, contact, or document excerpt - or take a photo of one. Luna reads it and adds what it mentions to your knowledge graph.");
        help.setPadding(0, 0, 0, dp(10));
        layout.addView(help);

        EditText input = new EditText(this);
        input.setHint("Paste or type something for Luna to learn...");
        input.setMinLines(4);
        input.setGravity(android.view.Gravity.TOP);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        layout.addView(input);

        Button photoButton = new Button(this);
        photoButton.setText("📷 Take a photo instead");
        photoButton.setOnClickListener(v -> takeCapturePhoto());
        layout.addView(photoButton);

        captureStatusText = new TextView(this);
        captureStatusText.setPadding(0, dp(10), 0, 0);
        layout.addView(captureStatusText);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Capture")
                .setView(layout)
                .setPositiveButton("Capture", null)
                .setNegativeButton("Close", null)
                .setOnDismissListener(d -> captureStatusText = null)
                .show();

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String text = input.getText().toString().trim();
            if (text.isEmpty()) return;
            if (!brain.isConfigured()) {
                captureStatusText.setText(brain.configurationHint());
                return;
            }
            captureStatusText.setText("Reading...");
            new Thread(() -> brain.capture(text, new LunaBrain.CaptureListener() {
                @Override
                public void onResult(int addedEntities, int addedLinks) {
                    runOnUiThread(() -> {
                        onCaptureResult(addedEntities, addedLinks);
                        if (addedEntities > 0) input.setText("");
                    });
                }

                @Override
                public void onError(String text2) {
                    runOnUiThread(() -> { if (captureStatusText != null) captureStatusText.setText(text2); });
                }
            })).start();
        });
    }

    private void onCaptureResult(int addedEntities, int addedLinks) {
        graphView.rebuildFromStore();
        refreshStats();
        if (captureStatusText == null) return;
        captureStatusText.setText(addedEntities == 0
                ? "Luna didn't find anything to remember in that."
                : "Found " + addedEntities + " new entit" + (addedEntities == 1 ? "y" : "ies")
                        + " and " + addedLinks + " link" + (addedLinks == 1 ? "" : "s") + ".");
    }

    private void takeCapturePhoto() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_IMAGE_CAPTURE);
            return;
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "luna_capture_" + System.currentTimeMillis() + ".jpg");
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        pendingPhotoUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (pendingPhotoUri == null) {
            if (captureStatusText != null) captureStatusText.setText("Couldn't create a place to save the photo.");
            return;
        }
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhotoUri);
        try {
            startActivityForResult(intent, REQ_IMAGE_CAPTURE);
        } catch (Exception e) {
            Toast.makeText(this, "No camera app available", Toast.LENGTH_SHORT).show();
        }
    }

    private void handleCapturedPhoto() {
        Uri uri = pendingPhotoUri;
        pendingPhotoUri = null;
        if (uri == null) return;
        if (!brain.isConfigured()) {
            if (captureStatusText != null) captureStatusText.setText(brain.configurationHint());
            return;
        }
        if (captureStatusText != null) captureStatusText.setText("Reading photo...");

        new Thread(() -> {
            byte[] bytes;
            try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) throw new java.io.IOException("Couldn't open the photo.");
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                bytes = out.toByteArray();
            } catch (Exception e) {
                runOnUiThread(() -> { if (captureStatusText != null) captureStatusText.setText("Error reading photo: " + e.getMessage()); });
                return;
            }

            brain.captureImage(bytes, new LunaBrain.CaptureListener() {
                @Override
                public void onResult(int addedEntities, int addedLinks) {
                    runOnUiThread(() -> onCaptureResult(addedEntities, addedLinks));
                }

                @Override
                public void onError(String text) {
                    runOnUiThread(() -> { if (captureStatusText != null) captureStatusText.setText(text); });
                }
            });
        }).start();
    }

    // ---------- local model file picker ----------

    private void pickModelFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // GGUF has no registered MIME type, so this has to accept anything and let the
        // user pick the right file themselves.
        intent.setType("*/*");
        try {
            startActivityForResult(intent, REQ_PICK_MODEL_FILE);
        } catch (Exception e) {
            Toast.makeText(this, "No file picker available on this device", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Copies the picked file into app-private storage so llama.cpp has a real filesystem path
     * to open (a content:// Uri from the system picker isn't one, and isn't guaranteed to stay
     * valid across app restarts). Runs off the main thread - model files can be several GB.
     */
    private void copyModelFile(Uri uri) {
        String displayName = queryDisplayName(uri);
        String targetName = (displayName != null && !displayName.trim().isEmpty())
                ? displayName
                : "model_" + System.currentTimeMillis() + ".gguf";

        if (localFileStatusText != null) {
            localFileStatusText.setText("Copying " + targetName + "... this can take a while for large files.");
        }

        new Thread(() -> {
            try {
                File modelsDir = new File(getFilesDir(), "models");
                if (!modelsDir.exists() && !modelsDir.mkdirs()) {
                    throw new IOException("Couldn't create storage for model files.");
                }
                File outFile = new File(modelsDir, targetName);

                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(outFile)) {
                    if (in == null) throw new IOException("Couldn't open the selected file.");
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }

                brain.setLocalModelFilePath(outFile.getAbsolutePath());
                runOnUiThread(() -> {
                    if (localFileStatusText != null) {
                        localFileStatusText.setText("Ready: " + outFile.getName() + " (" + formatSize(outFile.length()) + ")");
                    }
                    systemsLabel.setText(brain.isConfigured() ? "All systems connected" : brain.configurationHint());
                    Toast.makeText(this, "Model file ready.", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (localFileStatusText != null) localFileStatusText.setText("Error: " + e.getMessage());
                    Toast.makeText(this, "Couldn't copy model file: " + e.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    private String queryDisplayName(Uri uri) {
        try (android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String formatSize(long bytes) {
        if (bytes >= 1024L * 1024 * 1024) return String.format(Locale.US, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
        if (bytes >= 1024L * 1024) return String.format(Locale.US, "%.0f MB", bytes / (1024.0 * 1024));
        return bytes + " B";
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

        RadioButton localServerRadio = new RadioButton(this);
        localServerRadio.setId(View.generateViewId());
        localServerRadio.setText("Local server on this device — no API key");
        providerGroup.addView(localServerRadio);

        RadioButton localFileRadio = new RadioButton(this);
        localFileRadio.setId(View.generateViewId());
        localFileRadio.setText("Local model file, on-device — no API key");
        providerGroup.addView(localFileRadio);

        int checkedId = cloudRadio.getId();
        if (brain.isLocalServerProvider()) checkedId = localServerRadio.getId();
        else if (brain.isLocalFileProvider()) checkedId = localFileRadio.getId();
        providerGroup.check(checkedId);
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

        // ---- local server fields (e.g. Ollama) ----
        LinearLayout localServerSection = new LinearLayout(this);
        localServerSection.setOrientation(LinearLayout.VERTICAL);

        EditText localUrlInput = new EditText(this);
        localUrlInput.setHint("Server URL");
        localUrlInput.setText(brain.getLocalUrl());
        localServerSection.addView(localUrlInput);

        EditText localModelInput = new EditText(this);
        localModelInput.setHint("Model name (e.g. llama3.2:3b)");
        localModelInput.setText(brain.getLocalModel());
        localModelInput.setPadding(0, dp(6), 0, 0);
        localServerSection.addView(localModelInput);

        TextView localServerHelp = new TextView(this);
        localServerHelp.setText("Talks to an Ollama-compatible server already running with a model you've " +
                "pulled - on this phone (e.g. via Termux) or another device on your network. Nothing " +
                "leaves your network, no key needed.");
        localServerHelp.setTextSize(12);
        localServerHelp.setPadding(0, 4, 0, pad);
        localServerSection.addView(localServerHelp);
        layout.addView(localServerSection);

        // ---- local file fields (on-device GGUF via the vendored llama.cpp bridge) ----
        LinearLayout localFileSection = new LinearLayout(this);
        localFileSection.setOrientation(LinearLayout.VERTICAL);

        localFileStatusText = new TextView(this);
        String existingPath = brain.getLocalModelFilePath();
        localFileStatusText.setText(existingPath.isEmpty()
                ? "No file chosen yet."
                : "Current: " + new File(existingPath).getName());
        localFileStatusText.setPadding(0, 0, 0, dp(6));
        localFileSection.addView(localFileStatusText);

        Button chooseFileButton = new Button(this);
        chooseFileButton.setText("Choose model file (.gguf)...");
        chooseFileButton.setOnClickListener(v -> pickModelFile());
        localFileSection.addView(chooseFileButton);

        TextView localFileHelp = new TextView(this);
        localFileHelp.setText("Runs a .gguf file you've already downloaded directly on this device, no " +
                "server, no key. The file is copied into Luna's private storage the first time, which " +
                "can take a while for a large model. Screen-control tools aren't available in either " +
                "local mode yet - just Q&A and knowledge capture.");
        localFileHelp.setTextSize(12);
        localFileHelp.setPadding(0, 4, 0, pad);
        localFileSection.addView(localFileHelp);
        layout.addView(localFileSection);

        RadioButton finalLocalServerRadio = localServerRadio;
        RadioButton finalLocalFileRadio = localFileRadio;
        Runnable updateProviderSections = () -> {
            int checked = providerGroup.getCheckedRadioButtonId();
            boolean isLocalServer = checked == finalLocalServerRadio.getId();
            boolean isLocalFile = checked == finalLocalFileRadio.getId();
            cloudSection.setVisibility(isLocalServer || isLocalFile ? View.GONE : View.VISIBLE);
            localServerSection.setVisibility(isLocalServer ? View.VISIBLE : View.GONE);
            localFileSection.setVisibility(isLocalFile ? View.VISIBLE : View.GONE);
        };
        updateProviderSections.run();
        providerGroup.setOnCheckedChangeListener((group, id) -> updateProviderSections.run());

        TextView customPromptLabel = new TextView(this);
        customPromptLabel.setText("Custom instructions (optional)");
        customPromptLabel.setTextSize(12);
        customPromptLabel.setPadding(0, 0, 0, dp(4));
        layout.addView(customPromptLabel);

        EditText customPromptInput = new EditText(this);
        customPromptInput.setHint("e.g. \"Call me Boss\", \"keep answers to one sentence\", \"you're a bit sarcastic\"");
        customPromptInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        customPromptInput.setMinLines(3);
        customPromptInput.setGravity(Gravity.TOP | Gravity.START);
        customPromptInput.setText(brain.getCustomSystemPrompt());
        layout.addView(customPromptInput);

        TextView customPromptHelp = new TextView(this);
        customPromptHelp.setText("Your own instructions for how Luna should talk or behave, on top of her " +
                "built-in ones - applies no matter which provider above is selected.");
        customPromptHelp.setTextSize(12);
        customPromptHelp.setPadding(0, 4, 0, pad);
        layout.addView(customPromptHelp);

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

        Button phonePermsButton = new Button(this);
        phonePermsButton.setText(hasPhonePermissions() ? "Calls, texts & reminders: ON" : "Grant call/text/reminder permissions...");
        phonePermsButton.setOnClickListener(v -> requestPhonePermissions());
        layout.addView(phonePermsButton);

        TextView phoneHelp = new TextView(this);
        phoneHelp.setText("Lets Luna call or text a contact by name and set reminders that survive a restart.");
        phoneHelp.setTextSize(12);
        phoneHelp.setPadding(0, 4, 0, pad);
        layout.addView(phoneHelp);

        Button notificationAccessButton = new Button(this);
        notificationAccessButton.setText(isNotificationAccessEnabled() ? "Notification access: ON (tap to manage)" : "Enable notification access...");
        notificationAccessButton.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        layout.addView(notificationAccessButton);

        TextView notifHelp = new TextView(this);
        notifHelp.setText("Lets Luna see notifications from your other apps so you can ask things like “what did I miss”. Turned on manually in Settings, same as screen control.");
        notifHelp.setTextSize(12);
        notifHelp.setPadding(0, 4, 0, pad);
        layout.addView(notifHelp);

        Switch bubbleSwitch = new Switch(this);
        bubbleSwitch.setText("Floating bubble (quick access from any app)");
        bubbleSwitch.setChecked(brain.isBubbleEnabled());
        bubbleSwitch.setPadding(0, 0, 0, pad / 2);
        layout.addView(bubbleSwitch);

        TextView bubbleHelp = new TextView(this);
        bubbleHelp.setText("A small draggable orb that stays on top of other apps - tap it to ask Luna something without switching apps. Needs \"draw over other apps\" permission.");
        bubbleHelp.setTextSize(12);
        bubbleHelp.setPadding(0, 4, 0, pad);
        layout.addView(bubbleHelp);

        Button bluetoothPermButton = new Button(this);
        bluetoothPermButton.setText(hasBluetoothPermission() ? "Bluetooth panel access: ON" : "Grant Bluetooth permission...");
        bluetoothPermButton.setOnClickListener(v -> requestBluetoothPermission());
        layout.addView(bluetoothPermButton);

        Button brightnessPermButton = new Button(this);
        brightnessPermButton.setText(Settings.System.canWrite(this) ? "Brightness control: ON" : "Allow brightness control...");
        brightnessPermButton.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        });
        brightnessPermButton.setPadding(0, 0, 0, pad);
        layout.addView(brightnessPermButton);

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

                    int checkedNow = providerGroup.getCheckedRadioButtonId();
                    String provider = LunaBrain.PROVIDER_GEMINI;
                    if (checkedNow == finalLocalServerRadio.getId()) provider = LunaBrain.PROVIDER_LOCAL_SERVER;
                    else if (checkedNow == finalLocalFileRadio.getId()) provider = LunaBrain.PROVIDER_LOCAL_FILE;
                    brain.setProvider(provider);

                    brain.setCustomSystemPrompt(customPromptInput.getText().toString().trim());

                    brain.setMuted(muteSwitch.isChecked());
                    systemsLabel.setText(brain.isConfigured() ? "All systems connected" : brain.configurationHint());

                    boolean wantsAlwaysListening = alwaysListenSwitch.isChecked();
                    brain.setAlwaysListening(wantsAlwaysListening);
                    if (wantsAlwaysListening) requestRecordAudioThenStartAlwaysListening();
                    else LunaWakeWordService.stop(this);

                    boolean wantsBubble = bubbleSwitch.isChecked();
                    brain.setBubbleEnabled(wantsBubble);
                    if (wantsBubble) requestOverlayThenStartBubble();
                    else LunaBubbleService.stop(this);
                })
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(d -> localFileStatusText = null)
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

    // ---------- phone permissions (calls, texts, contacts, reminders) ----------

    private static final String[] PHONE_PERMISSIONS = {
            Manifest.permission.CALL_PHONE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_PHONE_STATE,
    };

    private boolean hasPhonePermissions() {
        for (String p : PHONE_PERMISSIONS) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void requestPhonePermissions() {
        requestPermissions(PHONE_PERMISSIONS, REQ_PHONE_PERMISSIONS);
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM));
            } catch (Exception ignored) {
                // Not all devices/OEM skins expose this screen - reminders still work with an
                // inexact fallback alarm in that case (see ReminderStore).
            }
        }
    }

    // ---------- notification access ----------

    private boolean isNotificationAccessEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return enabled != null && enabled.contains(getPackageName());
    }

    // ---------- floating bubble ----------

    private void requestOverlayThenStartBubble() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow “display over other apps”, then re-enable the bubble in Settings.", Toast.LENGTH_LONG).show();
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            return;
        }
        LunaBubbleService.start(this);
    }

    // ---------- bluetooth ----------

    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < 31) return true; // no runtime grant needed pre-Android 12
        return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN}, REQ_BLUETOOTH);
        }
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
