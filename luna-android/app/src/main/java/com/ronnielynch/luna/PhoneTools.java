package com.ronnielynch.luna;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.SmsManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * The tools Luna gained from the "be like Sara" request: calls, texts, reminders, a Bluetooth
 * quick-settings panel, and screen brightness. Each checks its own permission and returns a
 * plain error result (never throws/crashes) if it isn't granted yet, so a request that needs
 * one of these degrades to "ask the user to grant it in Settings" instead of failing silently.
 */
public class PhoneTools {

    private static final java.util.Set<String> NAMES = new java.util.HashSet<>(java.util.Arrays.asList(
            "call_contact", "send_text", "set_reminder", "open_bluetooth_panel", "set_brightness"));

    /** Lets LunaBrain route a functionCall to PhoneTools vs. ScreenTools by name. */
    public static boolean handles(String name) {
        return NAMES.contains(name);
    }

    public static JSONArray toolDeclarations() throws Exception {
        JSONArray tools = new JSONArray();

        tools.put(declaration("call_contact",
                "Place a phone call to a contact by name.",
                objOne("name", "string", "The contact's name, as the user said it.")));

        tools.put(declaration("send_text",
                "Send an SMS text message to a contact by name.",
                objTwo("name", "string", "The contact's name, as the user said it.",
                        "message", "string", "The message to send.")));

        tools.put(declaration("set_reminder",
                "Schedule a reminder. Use delay_minutes for a relative time (\"remind me in 20 " +
                        "minutes\") or at_hour/at_minute for a specific clock time today or " +
                        "tomorrow if that time has already passed today.",
                reminderParams()));

        tools.put(declaration("open_bluetooth_panel",
                "Open the system Bluetooth settings screen, so the user can turn it on/off or " +
                        "pick a device. Modern Android doesn't allow apps to toggle Bluetooth directly.",
                new JSONObject().put("type", "object").put("properties", new JSONObject())));

        tools.put(declaration("set_brightness",
                "Set the screen brightness.",
                objOne("percent", "integer", "Brightness from 0 (dimmest) to 100 (brightest).")));

        return tools;
    }

    public static JSONObject execute(Context context, String name, JSONObject args) {
        try {
            switch (name) {
                case "call_contact":
                    return callContact(context, args.optString("name", ""));
                case "send_text":
                    return sendText(context, args.optString("name", ""), args.optString("message", ""));
                case "set_reminder":
                    return setReminder(context, args);
                case "open_bluetooth_panel":
                    return openBluetoothPanel(context);
                case "set_brightness":
                    return setBrightness(context, args.optInt("percent", 50));
                default:
                    return error("Unknown tool: " + name);
            }
        } catch (Exception e) {
            return error("Tool failed: " + e.getMessage());
        }
    }

    // ---------- calls & texts ----------

    private static JSONObject callContact(Context context, String name) throws Exception {
        if (name.trim().isEmpty()) return error("No contact name given.");
        if (!hasPermission(context, Manifest.permission.CALL_PHONE)) {
            return error("Luna needs Phone permission first - grant it in Settings.");
        }
        String number = findPhoneNumber(context, name);
        if (number == null) return error("Couldn't find a contact called \"" + name + "\".");

        if (!hasPermission(context, Manifest.permission.READ_CONTACTS)) {
            return error("Luna needs Contacts permission first - grant it in Settings.");
        }

        Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        return new JSONObject().put("calling", name);
    }

    private static JSONObject sendText(Context context, String name, String message) throws Exception {
        if (name.trim().isEmpty()) return error("No contact name given.");
        if (message.trim().isEmpty()) return error("No message given.");
        if (!hasPermission(context, Manifest.permission.SEND_SMS)) {
            return error("Luna needs SMS permission first - grant it in Settings.");
        }
        String number = findPhoneNumber(context, name);
        if (number == null) return error("Couldn't find a contact called \"" + name + "\".");

        SmsManager sms = Build.VERSION.SDK_INT >= 31
                ? context.getSystemService(SmsManager.class)
                : SmsManager.getDefault();
        if (sms == null) return error("SMS isn't available on this device.");
        sms.sendTextMessage(number, null, message, null, null);
        return new JSONObject().put("texted", name);
    }

    private static String findPhoneNumber(Context context, String name) {
        if (!hasPermission(context, Manifest.permission.READ_CONTACTS)) return null;
        ContentResolver resolver = context.getContentResolver();
        String query = name.trim().toLowerCase(Locale.US);

        try (Cursor cursor = resolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER},
                null, null, null)) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                String displayName = cursor.getString(0);
                if (displayName != null && displayName.toLowerCase(Locale.US).contains(query)) {
                    return cursor.getString(1);
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    // ---------- reminders ----------

    private static JSONObject reminderParams() throws Exception {
        return new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject()
                        .put("message", new JSONObject().put("type", "string").put("description", "What to remind the user about."))
                        .put("delay_minutes", new JSONObject().put("type", "integer").put("description", "Minutes from now, for a relative time."))
                        .put("at_hour", new JSONObject().put("type", "integer").put("description", "0-23, for a specific clock time."))
                        .put("at_minute", new JSONObject().put("type", "integer").put("description", "0-59, for a specific clock time.")))
                .put("required", new JSONArray().put("message"));
    }

    private static JSONObject setReminder(Context context, JSONObject args) throws Exception {
        String message = args.optString("message", "").trim();
        if (message.isEmpty()) return error("No reminder message given.");

        long triggerAt;
        if (args.has("delay_minutes") && !args.isNull("delay_minutes")) {
            int minutes = args.optInt("delay_minutes", 0);
            if (minutes <= 0) return error("Need a positive delay_minutes.");
            triggerAt = System.currentTimeMillis() + minutes * 60_000L;
        } else if (args.has("at_hour")) {
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, args.optInt("at_hour", 9));
            cal.set(Calendar.MINUTE, args.optInt("at_minute", 0));
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
                cal.add(Calendar.DAY_OF_MONTH, 1);
            }
            triggerAt = cal.getTimeInMillis();
        } else {
            return error("Need either delay_minutes or at_hour/at_minute.");
        }

        ReminderStore.Reminder reminder = new ReminderStore(context).schedule(context, message, triggerAt);
        return new JSONObject().put("scheduled", reminder.message).put("triggerAtMillis", reminder.triggerAtMillis);
    }

    // ---------- bluetooth / brightness ----------

    private static JSONObject openBluetoothPanel(Context context) throws Exception {
        // Settings.Panel (API 29+) offers quick-toggle panels for Wi-Fi/NFC/volume/internet,
        // but not Bluetooth - this opens the full Bluetooth settings screen instead, which is
        // the actual documented way to get there.
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        return new JSONObject().put("opened", "bluetooth settings");
    }

    private static JSONObject setBrightness(Context context, int percent) throws Exception {
        int clamped = Math.max(0, Math.min(100, percent));
        if (!Settings.System.canWrite(context)) {
            return error("Luna needs \"Modify system settings\" permission first - grant it in Settings.");
        }
        int value = (int) Math.round(clamped / 100.0 * 255);
        Settings.System.putInt(context.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, value);
        return new JSONObject().put("brightnessPercent", clamped);
    }

    // ---------- helpers ----------

    private static boolean hasPermission(Context context, String permission) {
        return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static JSONObject declaration(String name, String description, JSONObject parameters) throws Exception {
        return new JSONObject().put("name", name).put("description", description).put("parameters", parameters);
    }

    private static JSONObject objOne(String propName, String type, String desc) throws Exception {
        return new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject().put(propName, new JSONObject().put("type", type).put("description", desc)))
                .put("required", new JSONArray().put(propName));
    }

    private static JSONObject objTwo(String p1, String t1, String d1, String p2, String t2, String d2) throws Exception {
        return new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject()
                        .put(p1, new JSONObject().put("type", t1).put("description", d1))
                        .put(p2, new JSONObject().put("type", t2).put("description", d2)))
                .put("required", new JSONArray().put(p1).put(p2));
    }

    private static JSONObject error(String message) {
        try {
            return new JSONObject().put("error", message);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
