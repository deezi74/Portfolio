package com.ronnielynch.luna;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Reminders Luna has scheduled via AlarmManager. Persisted so they survive the app's process
 * dying; {@link BootReceiver} re-schedules any still in the future after a reboot, since
 * AlarmManager itself forgets everything when the device restarts.
 */
public class ReminderStore {

    public static class Reminder {
        public String id;
        public String message;
        public long triggerAtMillis;
        Reminder(String id, String message, long triggerAtMillis) {
            this.id = id; this.message = message; this.triggerAtMillis = triggerAtMillis;
        }
    }

    private static final String PREFS_NAME = "luna_prefs";
    private static final String PREF_REMINDERS = "reminders_json";

    private final SharedPreferences prefs;

    public ReminderStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public List<Reminder> loadAll() {
        List<Reminder> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(PREF_REMINDERS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out.add(new Reminder(o.getString("id"), o.getString("message"), o.getLong("triggerAtMillis")));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private void saveAll(List<Reminder> reminders) {
        try {
            JSONArray arr = new JSONArray();
            for (Reminder r : reminders) {
                arr.put(new JSONObject().put("id", r.id).put("message", r.message).put("triggerAtMillis", r.triggerAtMillis));
            }
            prefs.edit().putString(PREF_REMINDERS, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Schedules a new reminder and persists it. Returns the reminder for confirmation text. */
    public Reminder schedule(Context context, String message, long triggerAtMillis) {
        String id = "r" + System.currentTimeMillis() + (int) (Math.random() * 9999);
        Reminder reminder = new Reminder(id, message, triggerAtMillis);

        List<Reminder> all = loadAll();
        all.add(reminder);
        saveAll(all);

        scheduleAlarm(context, reminder);
        return reminder;
    }

    public void clearAll(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (Reminder r : loadAll()) {
            if (am != null) am.cancel(pendingIntentFor(context, r.id));
        }
        prefs.edit().remove(PREF_REMINDERS).apply();
    }

    /** Called by BootReceiver - AlarmManager forgets everything on reboot. */
    public void rescheduleAllFuture(Context context) {
        List<Reminder> all = loadAll();
        List<Reminder> stillFuture = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (Reminder r : all) {
            if (r.triggerAtMillis > now) {
                scheduleAlarm(context, r);
                stillFuture.add(r);
            }
        }
        saveAll(stillFuture);
    }

    /** Called by ReminderReceiver once a reminder has fired, so it isn't kept/re-shown. */
    public void remove(String id) {
        List<Reminder> all = loadAll();
        all.removeIf(r -> r.id.equals(id));
        saveAll(all);
    }

    private void scheduleAlarm(Context context, Reminder r) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = pendingIntentFor(context, r.id);
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.triggerAtMillis, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, r.triggerAtMillis, pi);
            }
        } catch (SecurityException e) {
            // SCHEDULE_EXACT_ALARM not granted (API 31+) - fall back to an inexact alarm rather
            // than silently dropping the reminder.
            am.set(AlarmManager.RTC_WAKEUP, r.triggerAtMillis, pi);
        }
    }

    private PendingIntent pendingIntentFor(Context context, String id) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.putExtra(ReminderReceiver.EXTRA_ID, id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, flags);
    }
}
