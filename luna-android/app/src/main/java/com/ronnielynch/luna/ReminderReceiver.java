package com.ronnielynch.luna;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires when a reminder's AlarmManager alarm goes off; shows a notification and cleans up. */
public class ReminderReceiver extends BroadcastReceiver {

    public static final String EXTRA_ID = "reminder_id";
    private static final String CHANNEL_ID = "luna_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(EXTRA_ID);
        if (id == null) return;

        ReminderStore store = new ReminderStore(context);
        String message = null;
        for (ReminderStore.Reminder r : store.loadAll()) {
            if (r.id.equals(id)) { message = r.message; break; }
        }
        store.remove(id);
        if (message == null) return;

        new GraphStore(context).logActivity("system", "Reminder: " + message);
        showNotification(context, message);
    }

    private void showNotification(Context context, String message) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Luna reminders", NotificationManager.IMPORTANCE_HIGH);
        manager.createNotificationChannel(channel);

        Intent openApp = new Intent(context, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(context, message.hashCode(), openApp,
                PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setContentTitle("Luna reminder")
                .setContentText(message)
                .setSmallIcon(R.drawable.app_icon)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .build();

        manager.notify(message.hashCode(), notification);
    }
}
