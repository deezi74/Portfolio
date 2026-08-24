package com.ronnielynch.luna;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;

import java.util.ArrayList;
import java.util.Locale;

/**
 * A foreground service that keeps a speech recognizer running so Luna can be
 * woken up by saying her name, even while the app isn't open. Toggled from
 * Luna's settings (MainActivity).
 *
 * This is a real trade-off: it keeps the mic listening (locally, restarted
 * over and over - Android has no true "always on" recognizer) whenever
 * enabled, which costs battery and shows a persistent notification the whole
 * time it's on, by design, so it's never a silent background listener.
 */
public class LunaWakeWordService extends Service {

    private static final String CHANNEL_ID = "luna_wake_word";
    private static final int NOTIF_ID = 1;
    private static final String WAKE_WORD = "luna";

    public static void start(Context context) {
        context.startForegroundService(new Intent(context, LunaWakeWordService.class));
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, LunaWakeWordService.class));
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private LunaBrain brain;
    private boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        brain = new LunaBrain(this);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US);
        });
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification("Listening for “Luna…”");
        if (Build.VERSION.SDK_INT >= 30) {
            // FOREGROUND_SERVICE_TYPE_MICROPHONE itself requires API 30, even though
            // the 3-arg startForeground() overload exists from API 29.
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIF_ID, notification);
        }

        if (!running) {
            running = true;
            if (SpeechRecognizer.isRecognitionAvailable(this)) {
                setUpRecognizer();
                listenOnce();
            } else {
                updateNotification("Voice recognition isn't available on this device.");
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ---------- listening loop ----------

    private void setUpRecognizer() {
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                handleHeardSpeech(matches);
                scheduleNextListen(300);
            }

            @Override
            public void onPartialResults(Bundle partialResults) { }

            @Override
            public void onError(int error) {
                // ERROR_NO_MATCH / ERROR_SPEECH_TIMEOUT happen constantly while
                // idle - that's normal for a "keep restarting" always-on loop.
                int delay = (error == SpeechRecognizer.ERROR_NO_MATCH
                        || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) ? 200 : 1200;
                scheduleNextListen(delay);
            }
        });
    }

    private void handleHeardSpeech(ArrayList<String> matches) {
        if (matches == null || matches.isEmpty()) return;
        String heard = matches.get(0);
        String lower = heard.toLowerCase(Locale.US);
        int idx = lower.indexOf(WAKE_WORD);
        if (idx < 0) return;

        String command = heard.substring(idx + WAKE_WORD.length()).trim();
        command = command.replaceFirst("^[,.\\-!\\s]+", "");

        if (command.isEmpty()) {
            speak("Yes?");
            return;
        }

        updateNotification("Luna heard: “" + command + "”");
        speak(null); // stop any previous speech before Luna starts "thinking"
        final String finalCommand = command;
        new Thread(() -> brain.ask(finalCommand, new LunaBrain.Listener() {
            @Override
            public void onToolStep(String description) {
                updateNotification(description);
            }

            @Override
            public void onReply(String text) {
                updateNotification("Listening for “Luna…”");
                if (!brain.isMuted()) speak(text);
            }

            @Override
            public void onError(String text) {
                updateNotification("Listening for “Luna…”");
                if (!brain.isMuted()) speak(text);
            }
        })).start();
    }

    private void listenOnce() {
        if (!running || recognizer == null) return;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        try {
            recognizer.startListening(intent);
        } catch (Exception ignored) {
            scheduleNextListen(1000);
        }
    }

    private void scheduleNextListen(long delayMs) {
        mainHandler.postDelayed(this::listenOnce, delayMs);
    }

    private void speak(String text) {
        if (tts == null) return;
        if (text == null) {
            tts.stop();
            return;
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna_wake_reply");
    }

    // ---------- notification ----------

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Luna always-listening", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows while Luna is listening for her wake word.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent openApp = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp,
                PendingIntent.FLAG_IMMUTABLE);

        return new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Luna")
                .setContentText(text)
                .setSmallIcon(R.drawable.app_icon)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIF_ID, buildNotification(text));
    }
}
