package com.ronnielynch.luna;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * The tools Luna can call to control the phone: the Gemini function
 * declarations Luna is offered, and the code that actually runs each one.
 *
 * open_app only needs a PackageManager and works regardless of accessibility
 * permissions. Everything that touches what's on screen (show_screen, tap,
 * type_text, scroll, press_key) is delegated to {@link LunaAccessibilityService},
 * which the user has to explicitly turn on in Android's Accessibility settings.
 */
public class ScreenTools {

    public static JSONArray toolDeclarations() throws Exception {
        JSONArray tools = new JSONArray();

        tools.put(declaration("open_app",
                "Open an app by name, e.g. 'YouTube', 'Chrome', 'Settings'. Brings it to the front.",
                obj("app_name", "string", "The app's display name, as a user would say it.")));

        tools.put(declaration("show_screen",
                "Scan the current screen and show numbered circles over every tappable or " +
                        "editable element, so you can refer to them by number. Call this before " +
                        "tap/type_text/scroll if you don't already know the current numbers, and " +
                        "again after anything on screen changes.",
                new JSONObject().put("type", "object").put("properties", new JSONObject())));

        tools.put(declaration("tap",
                "Tap the numbered element from the most recent show_screen call.",
                obj("number", "integer", "The number of the element to tap.")));

        tools.put(declaration("type_text",
                "Type text into the numbered editable element from the most recent show_screen call.",
                objTwo("number", "integer", "The number of the text field.",
                        "text", "string", "The text to type into it.")));

        tools.put(declaration("scroll",
                "Scroll the screen.",
                enumArg("direction", new String[]{"up", "down"}, "Which way to scroll.")));

        tools.put(declaration("press_key",
                "Press a hardware/system key.",
                enumArg("key", new String[]{"back", "home", "enter"}, "Which key to press.")));

        return tools;
    }

    public static JSONObject execute(Context context, String name, JSONObject args) {
        try {
            switch (name) {
                case "open_app":
                    return openApp(context, args.optString("app_name", ""));
                case "show_screen":
                    return requireService().showScreen();
                case "tap":
                    return requireService().tap(args.optInt("number", -1));
                case "type_text":
                    return requireService().typeText(args.optInt("number", -1), args.optString("text", ""));
                case "scroll":
                    return requireService().scroll(args.optString("direction", "down"));
                case "press_key":
                    return requireService().pressKey(args.optString("key", "back"));
                default:
                    return error("Unknown tool: " + name);
            }
        } catch (ScreenControlDisabledException e) {
            return error("Screen control isn't turned on. Ask the user to enable " +
                    "'Luna - Screen control' under Settings > Accessibility, then try again.");
        } catch (Exception e) {
            return error("Tool failed: " + e.getMessage());
        }
    }

    private static LunaAccessibilityService requireService() throws ScreenControlDisabledException {
        LunaAccessibilityService service = LunaAccessibilityService.getInstance();
        if (service == null) throw new ScreenControlDisabledException();
        return service;
    }

    private static class ScreenControlDisabledException extends Exception {
    }

    private static JSONObject openApp(Context context, String appName) throws Exception {
        if (appName == null || appName.trim().isEmpty()) {
            return error("No app name given.");
        }
        String query = appName.trim().toLowerCase();

        PackageManager pm = context.getPackageManager();
        Intent launcherQuery = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(launcherQuery, 0);

        ResolveInfo bestMatch = null;
        for (ResolveInfo info : apps) {
            String label = info.loadLabel(pm).toString().toLowerCase();
            if (label.equals(query)) {
                bestMatch = info;
                break;
            }
            if (bestMatch == null && (label.contains(query) || query.contains(label))) {
                bestMatch = info;
            }
        }

        if (bestMatch == null) {
            return error("Couldn't find an app called \"" + appName + "\" on this phone.");
        }

        String packageName = bestMatch.activityInfo.packageName;
        Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
        if (launchIntent == null) {
            return error("Found \"" + appName + "\" but couldn't launch it.");
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(launchIntent);

        // Give the app a moment to come to the foreground before Luna's next
        // tool call (e.g. show_screen) reads the window content.
        try {
            Thread.sleep(900);
        } catch (InterruptedException ignored) {
        }

        return new JSONObject()
                .put("opened", bestMatch.loadLabel(pm).toString())
                .put("package", packageName);
    }

    // ---------- small JSON-schema builders ----------

    private static JSONObject declaration(String name, String description, JSONObject parameters) throws Exception {
        return new JSONObject().put("name", name).put("description", description).put("parameters", parameters);
    }

    private static JSONObject obj(String propName, String type, String desc) throws Exception {
        return new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject().put(propName,
                        new JSONObject().put("type", type).put("description", desc)))
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

    private static JSONObject enumArg(String propName, String[] values, String desc) throws Exception {
        JSONArray enumArr = new JSONArray();
        for (String v : values) enumArr.put(v);
        return new JSONObject()
                .put("type", "object")
                .put("properties", new JSONObject().put(propName,
                        new JSONObject().put("type", "string").put("enum", enumArr).put("description", desc)))
                .put("required", new JSONArray().put(propName));
    }

    private static JSONObject error(String message) {
        try {
            return new JSONObject().put("error", message);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
