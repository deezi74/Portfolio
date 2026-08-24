package com.ronnielynch.luna;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** AlarmManager forgets every scheduled alarm on reboot - this puts Luna's reminders back. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        new ReminderStore(context).rescheduleAllFuture(context);

        LunaBrain brain = new LunaBrain(context);
        if (brain.isAlwaysListening()) {
            LunaWakeWordService.start(context);
        }
        if (brain.isBubbleEnabled()) {
            LunaBubbleService.start(context);
        }
    }
}
