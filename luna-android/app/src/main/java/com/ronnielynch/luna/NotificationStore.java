package com.ronnielynch.luna;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * A rolling buffer of recent notifications Luna has seen, via LunaNotificationListenerService.
 * Folded into ask()'s context (like the knowledge graph) rather than requiring its own tool
 * call, so "what did I miss" just works as a normal question.
 */
public class NotificationStore {

    public static class Entry {
        public String app, title, text;
        public long at;
        Entry(String app, String title, String text, long at) {
            this.app = app; this.title = title; this.text = text; this.at = at;
        }
    }

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_NOTIFICATIONS = "notifications_json";
    private static final int MAX_ENTRIES = 50;

    private final SharedPreferences prefs;

    public NotificationStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void record(String app, String title, String text) {
        if ((title == null || title.trim().isEmpty()) && (text == null || text.trim().isEmpty())) return;
        List<Entry> all = loadAll();
        all.add(0, new Entry(app, title == null ? "" : title, text == null ? "" : text, System.currentTimeMillis()));
        while (all.size() > MAX_ENTRIES) all.remove(all.size() - 1);
        saveAll(all);
    }

    public List<Entry> loadAll() {
        List<Entry> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(PREF_NOTIFICATIONS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out.add(new Entry(o.getString("app"), o.getString("title"), o.getString("text"), o.optLong("at", 0)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private void saveAll(List<Entry> entries) {
        try {
            JSONArray arr = new JSONArray();
            for (Entry e : entries) {
                arr.put(new JSONObject().put("app", e.app).put("title", e.title).put("text", e.text).put("at", e.at));
            }
            prefs.edit().putString(PREF_NOTIFICATIONS, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    public void clear() {
        prefs.edit().remove(PREF_NOTIFICATIONS).apply();
    }

    /** A compact text block for the last [count] notifications, for use in a system prompt. */
    public String recentSummary(int count) {
        List<Entry> all = loadAll();
        if (all.isEmpty()) return "(none)";
        StringBuilder sb = new StringBuilder();
        int n = Math.min(count, all.size());
        for (int i = 0; i < n; i++) {
            Entry e = all.get(i);
            sb.append("- ").append(e.app).append(": ").append(e.title);
            if (!e.text.isEmpty()) sb.append(" - ").append(e.text);
            sb.append("\n");
        }
        return sb.toString();
    }
}
