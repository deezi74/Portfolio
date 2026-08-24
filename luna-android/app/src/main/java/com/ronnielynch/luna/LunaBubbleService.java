package com.ronnielynch.luna;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

/**
 * A small draggable floating orb, always on top of whatever app is in front - tap it to ask
 * Luna something without switching apps, like Sara's/Messenger's "chat head" bubble. Needs
 * SYSTEM_ALERT_WINDOW ("draw over other apps"), which the user has to grant manually in
 * Settings, same special-access pattern as everything else sensitive in this app.
 */
public class LunaBubbleService extends Service {

    private static final String CHANNEL_ID = "luna_bubble";
    private static final int NOTIF_ID = 3;
    private static final int BUBBLE_SIZE_DP = 56;

    public static void start(Context context) {
        context.startForegroundService(new Intent(context, LunaBubbleService.class));
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, LunaBubbleService.class));
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private FrameLayout bubbleView;
    private TextView replyView;
    private WindowManager.LayoutParams bubbleParams;
    private LunaBrain brain;
    private TextToSpeech tts;
    private SpeechRecognizer recognizer;
    private boolean listening = false;
    private boolean busy = false;

    private float dragStartX, dragStartY;
    private int startParamX, startParamY;
    private boolean dragMoved = false;

    @Override
    public void onCreate() {
        super.onCreate();
        brain = new LunaBrain(this);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US);
        });
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());
        if (bubbleView == null) addBubble();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        removeBubble();
        if (recognizer != null) recognizer.destroy();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ---------- overlay UI ----------

    private void addBubble() {
        if (windowManager == null) return;
        int density = (int) getResources().getDisplayMetrics().density;
        int sizePx = BUBBLE_SIZE_DP * density;

        bubbleView = new FrameLayout(this);
        View orb = new View(this);
        orb.setBackground(getDrawable(R.drawable.orb_background));
        bubbleView.addView(orb, new FrameLayout.LayoutParams(sizePx, sizePx));

        replyView = new TextView(this);
        replyView.setTextColor(Color.WHITE);
        replyView.setBackgroundColor(Color.parseColor("#DD161B22"));
        replyView.setPadding(24, 16, 24, 16);
        replyView.setMaxWidth(sizePx * 4);
        replyView.setVisibility(View.GONE);
        FrameLayout.LayoutParams replyParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        replyParams.gravity = Gravity.TOP | Gravity.START;
        replyParams.topMargin = sizePx + 8;
        bubbleView.addView(replyView, replyParams);

        bubbleParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = 0;
        bubbleParams.y = 300;

        orb.setOnTouchListener(this::handleTouch);

        try {
            windowManager.addView(bubbleView, bubbleParams);
        } catch (Exception e) {
            // SYSTEM_ALERT_WINDOW not granted - nothing to show; the service will just idle.
            stopSelf();
        }
    }

    private void removeBubble() {
        if (bubbleView != null && windowManager != null) {
            try { windowManager.removeView(bubbleView); } catch (Exception ignored) { }
        }
        bubbleView = null;
    }

    private boolean handleTouch(View v, MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragStartX = event.getRawX();
                dragStartY = event.getRawY();
                startParamX = bubbleParams.x;
                startParamY = bubbleParams.y;
                dragMoved = false;
                return true;
            case MotionEvent.ACTION_MOVE: {
                float dx = event.getRawX() - dragStartX;
                float dy = event.getRawY() - dragStartY;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragMoved = true;
                bubbleParams.x = startParamX + (int) dx;
                bubbleParams.y = startParamY + (int) dy;
                if (windowManager != null) windowManager.updateViewLayout(bubbleView, bubbleParams);
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (!dragMoved) onBubbleTapped();
                return true;
        }
        return false;
    }

    // ---------- tap-to-ask ----------

    private void onBubbleTapped() {
        if (busy || listening) return;
        if (!brain.isConfigured()) {
            showReply(brain.configurationHint());
            return;
        }
        startListening();
    }

    private void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            showReply("Voice input isn't available on this device.");
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(android.os.Bundle p) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { listening = false; }
                @Override public void onEvent(int e, android.os.Bundle b) { }
                @Override public void onPartialResults(android.os.Bundle b) { }

                @Override
                public void onResults(android.os.Bundle results) {
                    listening = false;
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        askLuna(matches.get(0));
                    }
                }

                @Override
                public void onError(int error) {
                    listening = false;
                    if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        showReply("Didn't catch that.");
                    }
                }
            });
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        try {
            listening = true;
            showReply("Listening...");
            recognizer.startListening(intent);
        } catch (Exception e) {
            listening = false;
        }
    }

    private void askLuna(String question) {
        busy = true;
        showReply("Thinking...");
        new Thread(() -> brain.ask(question, new LunaBrain.Listener() {
            @Override
            public void onToolStep(String description) {
                mainHandler.post(() -> showReply(description));
            }

            @Override
            public void onReply(String text) {
                busy = false;
                mainHandler.post(() -> {
                    showReply(text);
                    if (!brain.isMuted() && tts != null) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna_bubble");
                });
            }

            @Override
            public void onError(String text) {
                busy = false;
                mainHandler.post(() -> showReply(text));
            }
        })).start();
    }

    private void showReply(String text) {
        if (replyView == null) return;
        replyView.setText(text);
        replyView.setVisibility(View.VISIBLE);
        mainHandler.removeCallbacksAndMessages(null);
        mainHandler.postDelayed(() -> {
            if (replyView != null) replyView.setVisibility(View.GONE);
        }, 6000);
    }

    // ---------- notification ----------

    private Notification buildNotification() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Luna floating bubble", NotificationManager.IMPORTANCE_MIN);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);

        Intent openApp = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp, PendingIntent.FLAG_IMMUTABLE);

        return new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Luna")
                .setContentText("Floating bubble active - tap it to ask Luna anything.")
                .setSmallIcon(R.drawable.app_icon)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .build();
    }
}
