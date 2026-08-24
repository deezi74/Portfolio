package com.ronnielynch.luna;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Lets Luna see and control the screen: scans the accessibility tree for
 * tappable/editable elements, draws numbered circles over them so the user
 * can watch what Luna is looking at, and performs taps/typing/scrolling by
 * number.
 *
 * The user has to turn this on manually in Settings > Accessibility - Android
 * won't allow an app to enable it silently, by design.
 */
public class LunaAccessibilityService extends AccessibilityService {

    private static final int MAX_MARKERS = 30;
    private static final int MAIN_THREAD_TIMEOUT_SECONDS = 5;

    private static volatile LunaAccessibilityService instance;

    public static LunaAccessibilityService getInstance() {
        return instance;
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<Integer, AccessibilityNodeInfo> markers = new LinkedHashMap<>();
    private WindowManager windowManager;
    private FrameLayout overlayContainer;
    private boolean overlayAdded = false;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // No-op: Luna reads the tree on demand (show_screen) rather than
        // reacting to every event, to keep this simple and predictable.
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        instance = null;
        runOnMainSync(this::hideMarkersInternal);
        super.onDestroy();
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        runOnMainSync(this::hideMarkersInternal);
        return super.onUnbind(intent);
    }

    // ---------- tools ----------

    public JSONObject showScreen() throws Exception {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return new JSONObject().put("error", "Nothing to scan - no active window.");
        }

        List<AccessibilityNodeInfo> candidates = new ArrayList<>();
        collectInteractive(root, candidates);
        if (candidates.size() > MAX_MARKERS) {
            candidates = candidates.subList(0, MAX_MARKERS);
        }

        Map<Integer, AccessibilityNodeInfo> newMarkers = new LinkedHashMap<>();
        JSONArray elements = new JSONArray();
        int number = 1;
        for (AccessibilityNodeInfo node : candidates) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            String label = labelFor(node);
            String type = typeFor(node);

            newMarkers.put(number, node);
            elements.put(new JSONObject()
                    .put("number", number)
                    .put("label", label)
                    .put("type", type)
                    .put("editable", node.isEditable()));
            number++;
        }

        runOnMainSync(() -> {
            hideMarkersInternal();
            markers.clear();
            markers.putAll(newMarkers);
            drawMarkers(newMarkers);
        });

        return new JSONObject().put("elements", elements).put("count", elements.length());
    }

    public JSONObject tap(int number) throws Exception {
        AccessibilityNodeInfo node = markers.get(number);
        if (node == null) {
            return new JSONObject().put("error", "No element numbered " + number + " - call show_screen first.");
        }
        String label = labelFor(node);

        boolean ok = clickNodeOrAncestor(node);
        if (!ok) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            ok = dispatchTapGesture(bounds.centerX(), bounds.centerY());
        }

        runOnMainSync(this::hideMarkersInternal);
        markers.clear();
        settle();

        return ok
                ? new JSONObject().put("tapped", label)
                : new JSONObject().put("error", "Couldn't tap [" + number + "] " + label + ".");
    }

    public JSONObject typeText(int number, String text) throws Exception {
        AccessibilityNodeInfo node = markers.get(number);
        if (node == null) {
            return new JSONObject().put("error", "No element numbered " + number + " - call show_screen first.");
        }
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        return ok
                ? new JSONObject().put("typed", text)
                : new JSONObject().put("error", "Couldn't type into [" + number + "] - it may not be a text field.");
    }

    public JSONObject scroll(String direction) throws Exception {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo scrollable = root == null ? null : findScrollable(root);
        if (scrollable == null) {
            return new JSONObject().put("error", "Nothing on screen looks scrollable.");
        }
        int action = "up".equalsIgnoreCase(direction)
                ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
        boolean ok = scrollable.performAction(action);
        runOnMainSync(this::hideMarkersInternal);
        markers.clear();
        settle();
        return new JSONObject().put(ok ? "scrolled" : "error", direction);
    }

    public JSONObject pressKey(String key) throws Exception {
        boolean ok;
        switch (key == null ? "" : key.toLowerCase(java.util.Locale.US)) {
            case "home":
                ok = performGlobalAction(GLOBAL_ACTION_HOME);
                break;
            case "enter":
                AccessibilityNodeInfo focused = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (focused == null) {
                    ok = false;
                } else if (android.os.Build.VERSION.SDK_INT >= 30) {
                    ok = focused.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                } else {
                    // ACTION_IME_ENTER needs API 30+; older devices fall back to a
                    // plain click on the focused field (works for many search boxes).
                    ok = focused.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                }
                break;
            case "back":
            default:
                ok = performGlobalAction(GLOBAL_ACTION_BACK);
                break;
        }
        runOnMainSync(this::hideMarkersInternal);
        markers.clear();
        settle();
        return new JSONObject().put(ok ? "pressed" : "error", key);
    }

    // ---------- tree scanning ----------

    private void collectInteractive(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> out) {
        if (node == null || out.size() >= MAX_MARKERS) return;

        if (node.isVisibleToUser()
                && (node.isClickable() || node.isEditable() || node.isCheckable() || node.isLongClickable())) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (!bounds.isEmpty()) {
                out.add(node);
            }
        }

        for (int i = 0; i < node.getChildCount() && out.size() < MAX_MARKERS; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) collectInteractive(child, out);
        }
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isScrollable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findScrollable(node.getChild(i));
            if (found != null) return found;
        }
        return null;
    }

    private boolean clickNodeOrAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        int depth = 0;
        while (current != null && depth < 8) {
            if (current.isClickable() && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true;
            }
            current = current.getParent();
            depth++;
        }
        return false;
    }

    private String labelFor(AccessibilityNodeInfo node) {
        CharSequence text = node.getText();
        if (text != null && text.length() > 0) return truncate(text.toString());
        CharSequence desc = node.getContentDescription();
        if (desc != null && desc.length() > 0) return truncate(desc.toString());
        CharSequence cls = node.getClassName();
        if (cls != null) {
            String simple = cls.toString();
            int lastDot = simple.lastIndexOf('.');
            return lastDot >= 0 ? simple.substring(lastDot + 1) : simple;
        }
        return "element";
    }

    private String typeFor(AccessibilityNodeInfo node) {
        if (node.isEditable()) return "text field";
        if (node.isCheckable()) return "checkbox/switch";
        CharSequence cls = node.getClassName();
        return cls != null ? cls.toString() : "element";
    }

    private static String truncate(String s) {
        s = s.trim();
        return s.length() > 60 ? s.substring(0, 60) + "..." : s;
    }

    // ---------- gestures ----------

    private boolean dispatchTapGesture(int x, int y) {
        CountDownLatch latch = new CountDownLatch(1);
        boolean[] result = {false};
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(path, 0, 80))
                .build();
        boolean dispatched = dispatchGesture(gesture, new AccessibilityService.GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                result[0] = true;
                latch.countDown();
            }

            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                latch.countDown();
            }
        }, mainHandler);
        if (!dispatched) return false;
        try {
            latch.await(MAIN_THREAD_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        return result[0];
    }

    // ---------- overlay ----------

    private void drawMarkers(Map<Integer, AccessibilityNodeInfo> toDraw) {
        if (windowManager == null || toDraw.isEmpty()) return;

        overlayContainer = new FrameLayout(this);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int badgeSize = (int) (28 * dm.density);

        for (Map.Entry<Integer, AccessibilityNodeInfo> entry : toDraw.entrySet()) {
            Rect bounds = new Rect();
            entry.getValue().getBoundsInScreen(bounds);

            TextView badge = new TextView(this);
            badge.setText(String.valueOf(entry.getKey()));
            badge.setTextColor(Color.WHITE);
            badge.setTextSize(12);
            badge.setGravity(Gravity.CENTER);
            badge.setTypeface(badge.getTypeface(), android.graphics.Typeface.BOLD);

            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            bg.setColor(Color.parseColor("#DD161B22"));
            bg.setStroke((int) (2 * dm.density), Color.parseColor("#00BCD4"));
            badge.setBackground(bg);

            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(badgeSize, badgeSize);
            lp.leftMargin = Math.max(0, bounds.left - badgeSize / 2);
            lp.topMargin = Math.max(0, bounds.top - badgeSize / 2);
            overlayContainer.addView(badge, lp);
        }

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;

        try {
            windowManager.addView(overlayContainer, params);
            overlayAdded = true;
        } catch (Exception ignored) {
            // Overlay is a visual aid only - taps/typing still work without it.
        }
    }

    private void hideMarkersInternal() {
        if (overlayAdded && overlayContainer != null && windowManager != null) {
            try {
                windowManager.removeView(overlayContainer);
            } catch (Exception ignored) {
            }
        }
        overlayAdded = false;
        overlayContainer = null;
    }

    private void settle() {
        try {
            Thread.sleep(350);
        } catch (InterruptedException ignored) {
        }
    }

    private void runOnMainSync(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            r.run();
            return;
        }
        CountDownLatch latch = new CountDownLatch(1);
        mainHandler.post(() -> {
            r.run();
            latch.countDown();
        });
        try {
            latch.await(MAIN_THREAD_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
    }
}
