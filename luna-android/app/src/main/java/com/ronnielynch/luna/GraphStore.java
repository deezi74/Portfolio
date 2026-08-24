package com.ronnielynch.luna;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Luna's knowledge graph: the entities and relationships extracted from
 * things the user captures, plus an activity log. Persisted on-device only
 * (SharedPreferences JSON) - same posture as the web version, no backend.
 */
public class GraphStore {

    public static class Entity {
        public String id, type, label, note;
        Entity(String id, String type, String label, String note) {
            this.id = id; this.type = type; this.label = label; this.note = note;
        }
    }

    public static class Link {
        public String id, a, b, relation;
        Link(String id, String a, String b, String relation) {
            this.id = id; this.a = a; this.b = b; this.relation = relation;
        }
    }

    public static class ActivityItem {
        public String id, kind, text;
        public long at;
        ActivityItem(String id, String kind, String text, long at) {
            this.id = id; this.kind = kind; this.text = text; this.at = at;
        }
    }

    public static class TypeMeta {
        public final int color;
        public final String icon;
        public final String label;
        TypeMeta(int color, String icon, String label) { this.color = color; this.icon = icon; this.label = label; }
    }

    public static final Map<String, TypeMeta> TYPES = new LinkedHashMap<>();
    static {
        TYPES.put("person", new TypeMeta(Color.parseColor("#F472B6"), "👤", "Person"));
        TYPES.put("location", new TypeMeta(Color.parseColor("#4ADE80"), "📍", "Location"));
        TYPES.put("document", new TypeMeta(Color.parseColor("#60A5FA"), "📄", "Document"));
        TYPES.put("concept", new TypeMeta(Color.parseColor("#D4E157"), "💡", "Concept"));
        TYPES.put("ai_model", new TypeMeta(Color.parseColor("#A78BFA"), "✨", "AI Model"));
        TYPES.put("technology", new TypeMeta(Color.parseColor("#22D3EE"), "⚙", "Technology"));
        TYPES.put("task", new TypeMeta(Color.parseColor("#FBBF24"), "✓", "Task"));
        TYPES.put("thought", new TypeMeta(Color.parseColor("#E879F9"), "🧠", "Thought"));
    }

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_ENTITIES = "graph_entities_json";
    private static final String PREF_LINKS = "graph_links_json";
    private static final String PREF_ACTIVITY = "activity_json";
    private static final int MAX_ACTIVITY = 100;

    public final List<Entity> entities = new ArrayList<>();
    public final List<Link> links = new ArrayList<>();
    public final List<ActivityItem> activity = new ArrayList<>();

    private final SharedPreferences prefs;

    public GraphStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        load();
        if (entities.isEmpty()) seed();
    }

    private void seed() {
        entities.clear();
        links.clear();
        entities.add(new Entity("luna-core", "technology", "Luna Core", "Your assistant's reasoning engine."));
        entities.add(new Entity("gemini-model", "ai_model", "Gemini 2.0 Flash", "Powers Luna's answers and extraction."));
        links.add(new Link("l-seed", "luna-core", "gemini-model", "runs on"));
        save();
    }

    public void clearGraph() {
        seed();
    }

    public void clearActivity() {
        activity.clear();
        saveActivity();
    }

    public Entity byId(String id) {
        for (Entity e : entities) if (e.id.equals(id)) return e;
        return null;
    }

    public void logActivity(String kind, String text) {
        activity.add(0, new ActivityItem("a" + System.currentTimeMillis() + (int) (Math.random() * 9999), kind, text, System.currentTimeMillis()));
        while (activity.size() > MAX_ACTIVITY) activity.remove(activity.size() - 1);
        saveActivity();
    }

    /** Merges Gemini's record_entities args into the graph. Returns {addedEntities, addedLinks}. */
    public int[] mergeExtraction(JSONObject args) {
        Map<String, String> labelIndex = new LinkedHashMap<>();
        for (Entity e : entities) labelIndex.put(normalize(e.label), e.id);

        int addedEntities = 0;
        List<String> newIds = new ArrayList<>();
        JSONArray rawEntities = args.optJSONArray("entities");
        if (rawEntities != null) {
            for (int i = 0; i < rawEntities.length(); i++) {
                JSONObject raw = rawEntities.optJSONObject(i);
                if (raw == null) continue;
                String label = raw.optString("label", "").trim();
                if (label.isEmpty()) continue;
                String key = normalize(label);
                if (labelIndex.containsKey(key)) continue;
                String type = raw.optString("type", "concept");
                if (!TYPES.containsKey(type)) type = "concept";
                String id = "e" + System.currentTimeMillis() + (int) (Math.random() * 9999);
                entities.add(new Entity(id, type, label, raw.optString("note", "")));
                labelIndex.put(key, id);
                newIds.add(id);
                addedEntities++;
            }
        }

        int addedLinks = 0;
        java.util.Set<String> existingPairs = new java.util.HashSet<>();
        for (Link l : links) existingPairs.add(pairKey(l.a, l.b));

        JSONArray rawLinks = args.optJSONArray("links");
        if (rawLinks != null) {
            for (int i = 0; i < rawLinks.length(); i++) {
                JSONObject raw = rawLinks.optJSONObject(i);
                if (raw == null) continue;
                String aId = labelIndex.get(normalize(raw.optString("a", "")));
                String bId = labelIndex.get(normalize(raw.optString("b", "")));
                if (aId == null || bId == null || aId.equals(bId)) continue;
                String key = pairKey(aId, bId);
                if (existingPairs.contains(key)) continue;
                links.add(new Link("k" + System.currentTimeMillis() + (int) (Math.random() * 9999), aId, bId, raw.optString("relation", "")));
                existingPairs.add(key);
                addedLinks++;
            }
        }

        if (addedLinks == 0 && !newIds.isEmpty()) {
            for (String id : newIds) {
                String key = pairKey("luna-core", id);
                if (!existingPairs.contains(key) && byId("luna-core") != null) {
                    links.add(new Link("k" + System.currentTimeMillis() + (int) (Math.random() * 9999), "luna-core", id, ""));
                    existingPairs.add(key);
                    addedLinks++;
                }
            }
        }

        save();
        return new int[]{addedEntities, addedLinks};
    }

    private static String normalize(String s) { return s == null ? "" : s.trim().toLowerCase(java.util.Locale.US); }
    private static String pairKey(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }

    /** Builds a compact text block describing the graph, for grounding Gemini's answers. */
    public String contextBlock() {
        StringBuilder sb = new StringBuilder("Entities:\n");
        int cap = Math.min(entities.size(), 120);
        for (int i = 0; i < cap; i++) {
            Entity e = entities.get(i);
            TypeMeta meta = TYPES.get(e.type);
            sb.append("- ").append(e.label).append(" (").append(meta != null ? meta.label : e.type).append(")");
            if (e.note != null && !e.note.isEmpty()) sb.append(": ").append(e.note);
            sb.append("\n");
        }
        sb.append("\nRelationships:\n");
        int linkCap = Math.min(links.size(), 150);
        for (int i = 0; i < linkCap; i++) {
            Link l = links.get(i);
            Entity a = byId(l.a), b = byId(l.b);
            if (a == null || b == null) continue;
            sb.append("- ").append(a.label).append(" ")
                    .append(l.relation != null && !l.relation.isEmpty() ? "(" + l.relation + ")" : "↔")
                    .append(" ").append(b.label).append("\n");
        }
        return sb.toString();
    }

    // ---------- persistence ----------

    private void save() {
        try {
            JSONArray e = new JSONArray();
            for (Entity ent : entities) {
                e.put(new JSONObject().put("id", ent.id).put("type", ent.type).put("label", ent.label).put("note", ent.note == null ? "" : ent.note));
            }
            prefs.edit().putString(PREF_ENTITIES, e.toString()).apply();

            JSONArray l = new JSONArray();
            for (Link link : links) {
                l.put(new JSONObject().put("id", link.id).put("a", link.a).put("b", link.b).put("relation", link.relation == null ? "" : link.relation));
            }
            prefs.edit().putString(PREF_LINKS, l.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private void saveActivity() {
        try {
            JSONArray arr = new JSONArray();
            for (ActivityItem item : activity) {
                arr.put(new JSONObject().put("id", item.id).put("kind", item.kind).put("text", item.text).put("at", item.at));
            }
            prefs.edit().putString(PREF_ACTIVITY, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private void load() {
        try {
            JSONArray e = new JSONArray(prefs.getString(PREF_ENTITIES, "[]"));
            for (int i = 0; i < e.length(); i++) {
                JSONObject o = e.getJSONObject(i);
                entities.add(new Entity(o.getString("id"), o.getString("type"), o.getString("label"), o.optString("note", "")));
            }
        } catch (Exception ignored) {
        }
        try {
            JSONArray l = new JSONArray(prefs.getString(PREF_LINKS, "[]"));
            for (int i = 0; i < l.length(); i++) {
                JSONObject o = l.getJSONObject(i);
                links.add(new Link(o.getString("id"), o.getString("a"), o.getString("b"), o.optString("relation", "")));
            }
        } catch (Exception ignored) {
        }
        try {
            JSONArray a = new JSONArray(prefs.getString(PREF_ACTIVITY, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                activity.add(new ActivityItem(o.getString("id"), o.getString("kind"), o.getString("text"), o.optLong("at", 0)));
            }
        } catch (Exception ignored) {
        }
    }
}
