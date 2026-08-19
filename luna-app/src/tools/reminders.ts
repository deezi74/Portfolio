import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface ReminderInput {
  title: string;
  body?: string;
  at: Date;
}

export async function requestReminderPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return !!result.granted;
}

/** Schedules a local reminder notification. Returns the notification id (usable to cancel it). */
export async function scheduleReminder({ title, body, at }: ReminderInput): Promise<string | null> {
  const granted = await requestReminderPermission();
  if (!granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: `🌙 ${title}`, body, data: { source: 'luna' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
    },
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function listScheduledReminders() {
  return Notifications.getAllScheduledNotificationsAsync();
}
