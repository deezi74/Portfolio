package com.ronnielynch.luna;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A from-scratch force-directed graph: repulsion between nodes, spring links,
 * center gravity, drawn on a Canvas with pan/pinch-zoom and tap-to-select.
 * No external charting library - just a physics tick + onDraw.
 */
public class GraphView extends View {

    private static final float REPULSE = 2600f;
    private static final float LINK_LEN = 220f;
    private static final float SPRING = 0.02f;
    private static final float CENTER_PULL = 0.0025f;
    private static final float DAMPING = 0.82f;

    private static class Node {
        String id, type, label, note;
        float x, y, vx, vy, r;
    }

    private static class LinkVis {
        Node a, b;
    }

    private GraphStore store;
    private final List<Node> nodes = new ArrayList<>();
    private final Map<String, Node> nodeById = new HashMap<>();
    private final List<LinkVis> linkVis = new ArrayList<>();
    private Set<String> visibleTypes = new HashSet<>(GraphStore.TYPES.keySet());

    private float zoom = 1f, panX = 0f, panY = 0f;
    private Node selected;

    public interface OnNodeSelectedListener {
        void onNodeSelected(String type, String label, String note, float screenX, float screenY);
        void onNodeDeselected();
    }

    private OnNodeSelectedListener selectionListener;

    private final Paint linkPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint nodePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glyphPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private ScaleGestureDetector scaleDetector;
    private GestureDetector gestureDetector;
    private float dragLastX, dragLastY;
    private boolean dragging = false;

    public GraphView(Context context, AttributeSet attrs) {
        super(context, attrs);
        linkPaint.setColor(Color.parseColor("#408B96A5"));
        linkPaint.setStrokeWidth(2f);
        nodePaint.setStyle(Paint.Style.FILL);
        glyphPaint.setTextAlign(Paint.Align.CENTER);
        glyphPaint.setColor(Color.parseColor("#0A0E14"));

        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                zoom = clamp(zoom * detector.getScaleFactor(), 0.3f, 3f);
                invalidate();
                return true;
            }
        });

        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                handleTap(e.getX(), e.getY());
                return true;
            }
        });

        postOnAnimation(this::tickAndInvalidate);
    }

    public void setStore(GraphStore store) {
        this.store = store;
        rebuildFromStore();
    }

    public void setOnNodeSelectedListener(OnNodeSelectedListener listener) {
        this.selectionListener = listener;
    }

    public void setVisibleTypes(Set<String> types) {
        this.visibleTypes = types;
        invalidate();
        postInvalidateStats();
    }

    public void setTypeVisible(String type, boolean visible) {
        if (visible) visibleTypes.add(type); else visibleTypes.remove(type);
        invalidate();
        postInvalidateStats();
    }

    public boolean isTypeVisible(String type) { return visibleTypes.contains(type); }

    /** Call after captures/graph edits so new entities appear. Preserves positions of existing nodes. */
    public void rebuildFromStore() {
        if (store == null) return;
        Map<String, Integer> degree = new HashMap<>();
        for (GraphStore.Link l : store.links) {
            degree.merge(l.a, 1, Integer::sum);
            degree.merge(l.b, 1, Integer::sum);
        }

        Map<String, Node> prev = new HashMap<>(nodeById);
        nodes.clear();
        nodeById.clear();

        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        for (GraphStore.Entity e : store.entities) {
            Node n = prev.get(e.id);
            if (n == null) {
                n = new Node();
                n.x = cx + (float) (Math.random() - 0.5) * 80f;
                n.y = cy + (float) (Math.random() - 0.5) * 80f;
            }
            n.id = e.id;
            n.type = GraphStore.TYPES.containsKey(e.type) ? e.type : "concept";
            n.label = e.label;
            n.note = e.note;
            Integer d = degree.get(e.id);
            n.r = 34f + Math.min(4, d == null ? 0 : d) * 6f;
            nodes.add(n);
            nodeById.put(e.id, n);
        }

        linkVis.clear();
        for (GraphStore.Link l : store.links) {
            Node a = nodeById.get(l.a), b = nodeById.get(l.b);
            if (a == null || b == null) continue;
            LinkVis lv = new LinkVis();
            lv.a = a; lv.b = b;
            linkVis.add(lv);
        }

        postInvalidateStats();
    }

    private Runnable statsListener;
    public void setStatsListener(Runnable r) { this.statsListener = r; }
    private void postInvalidateStats() { if (statsListener != null) statsListener.run(); }

    public int visibleNodeCount() {
        int c = 0;
        for (Node n : nodes) if (visibleTypes.contains(n.type)) c++;
        return c;
    }

    public int visibleLinkCount() {
        int c = 0;
        for (LinkVis l : linkVis) if (visibleTypes.contains(l.a.type) && visibleTypes.contains(l.b.type)) c++;
        return c;
    }

    // ---------- physics ----------

    private void tickAndInvalidate() {
        tick();
        invalidate();
        postOnAnimation(this::tickAndInvalidate);
    }

    private void tick() {
        List<Node> active = new ArrayList<>();
        for (Node n : nodes) if (visibleTypes.contains(n.type)) active.add(n);

        for (int i = 0; i < active.size(); i++) {
            for (int j = i + 1; j < active.size(); j++) {
                Node a = active.get(i), b = active.get(j);
                float dx = b.x - a.x, dy = b.y - a.y;
                float distSq = dx * dx + dy * dy + 0.01f;
                float dist = (float) Math.sqrt(distSq);
                float force = REPULSE / distSq;
                float fx = force * dx / dist, fy = force * dy / dist;
                a.vx -= fx; a.vy -= fy;
                b.vx += fx; b.vy += fy;
            }
        }

        for (LinkVis l : linkVis) {
            if (!visibleTypes.contains(l.a.type) || !visibleTypes.contains(l.b.type)) continue;
            float dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
            float dist = (float) Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01f) dist = 0.01f;
            float diff = (dist - LINK_LEN) * SPRING;
            float fx = diff * dx / dist, fy = diff * dy / dist;
            l.a.vx += fx; l.a.vy += fy;
            l.b.vx -= fx; l.b.vy -= fy;
        }

        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        for (Node n : active) {
            n.vx += (cx - n.x) * CENTER_PULL;
            n.vy += (cy - n.y) * CENTER_PULL;
            n.vx *= DAMPING; n.vy *= DAMPING;
            n.x += n.vx; n.y += n.vy;
        }
    }

    // ---------- drawing ----------

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.save();
        canvas.translate(getWidth() / 2f + panX, getHeight() / 2f + panY);
        canvas.scale(zoom, zoom);

        for (LinkVis l : linkVis) {
            if (!visibleTypes.contains(l.a.type) || !visibleTypes.contains(l.b.type)) continue;
            canvas.drawLine(l.a.x, l.a.y, l.b.x, l.b.y, linkPaint);
        }

        for (Node n : nodes) {
            if (!visibleTypes.contains(n.type)) continue;
            GraphStore.TypeMeta meta = GraphStore.TYPES.get(n.type);
            int color = meta != null ? meta.color : Color.GRAY;
            nodePaint.setColor(color);
            nodePaint.setAlpha(n == selected ? 255 : 210);
            canvas.drawCircle(n.x, n.y, n.r, nodePaint);
            if (n == selected) {
                nodePaint.setStyle(Paint.Style.STROKE);
                nodePaint.setColor(Color.WHITE);
                nodePaint.setStrokeWidth(3f / zoom);
                canvas.drawCircle(n.x, n.y, n.r, nodePaint);
                nodePaint.setStyle(Paint.Style.FILL);
            }
            glyphPaint.setTextSize(n.r);
            canvas.drawText(meta != null ? meta.icon : "?", n.x, n.y + n.r / 3f, glyphPaint);
        }

        canvas.restore();
    }

    // ---------- touch ----------

    @Override
    public boolean performClick() {
        super.performClick();
        return true;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        scaleDetector.onTouchEvent(event);
        gestureDetector.onTouchEvent(event);

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragLastX = event.getX(); dragLastY = event.getY(); dragging = true;
                break;
            case MotionEvent.ACTION_MOVE:
                if (dragging && !scaleDetector.isInProgress() && event.getPointerCount() == 1) {
                    panX += event.getX() - dragLastX;
                    panY += event.getY() - dragLastY;
                    dragLastX = event.getX(); dragLastY = event.getY();
                    invalidate();
                }
                break;
            case MotionEvent.ACTION_UP:
                dragging = false;
                performClick();
                break;
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                break;
        }
        return true;
    }

    private void handleTap(float screenX, float screenY) {
        performClick();
        float wx = (screenX - getWidth() / 2f - panX) / zoom;
        float wy = (screenY - getHeight() / 2f - panY) / zoom;
        Node hit = null;
        for (Node n : nodes) {
            if (!visibleTypes.contains(n.type)) continue;
            float dx = n.x - wx, dy = n.y - wy;
            float tolerance = n.r + 12f;
            if (dx * dx + dy * dy <= tolerance * tolerance) { hit = n; break; }
        }
        selected = hit;
        invalidate();
        if (hit != null && selectionListener != null) {
            float sx = getWidth() / 2f + panX + hit.x * zoom;
            float sy = getHeight() / 2f + panY + hit.y * zoom;
            GraphStore.TypeMeta meta = GraphStore.TYPES.get(hit.type);
            selectionListener.onNodeSelected(meta != null ? meta.label : hit.type, hit.label, hit.note, sx, sy);
        } else if (selectionListener != null) {
            selectionListener.onNodeDeselected();
        }
    }

    public void zoomBy(float factor) {
        zoom = clamp(zoom * factor, 0.3f, 3f);
        invalidate();
    }

    public void fitToScreen() {
        List<Node> active = new ArrayList<>();
        for (Node n : nodes) if (visibleTypes.contains(n.type)) active.add(n);
        if (active.isEmpty()) { zoom = 1f; panX = 0f; panY = 0f; invalidate(); return; }

        float minX = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, minY = Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (Node n : active) {
            minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        }
        float w = Math.max(1f, maxX - minX), h = Math.max(1f, maxY - minY);
        float pad = 160f;
        float targetZoom = Math.min((getWidth() - pad) / w, (getHeight() - pad) / h);
        zoom = clamp(Float.isFinite(targetZoom) ? targetZoom : 1f, 0.35f, 2f);
        panX = -((minX + maxX) / 2f) * zoom;
        panY = -((minY + maxY) / 2f) * zoom;
        invalidate();
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
}
