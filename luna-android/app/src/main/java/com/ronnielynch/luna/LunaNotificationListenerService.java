package com.ronnielynch.luna;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Reads notifications from other apps so Luna can answer things like "what did I miss" - folded
 * into ask()'s context via NotificationStore rather than acted on automatically. The user has to
 * grant this manually in Settings > Notification access; Android treats it as sensitive on
 * purpose, and so does Luna (nothing here reacts to a notification on its own).
 */
public class LunaNotificationListenerService extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;

        CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        if (title == null && text == null) return;

        new NotificationStore(this).record(
                appLabel(sbn.getPackageName()),
                title == null ? "" : title.toString(),
                text == null ? "" : text.toString());
    }

    private String appLabel(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return packageName;
        }
    }
}
