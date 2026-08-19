import { requestCalendarPermissions, getDefaultCalendarSync, getCalendars, listEvents } from 'expo-calendar';

export async function ensureCalendarPermission(): Promise<boolean> {
  const result = await requestCalendarPermissions();
  return !!result.granted;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string | null;
}

export async function getUpcomingEvents(withinDays = 7): Promise<UpcomingEvent[]> {
  const granted = await ensureCalendarPermission();
  if (!granted) return [];
  const calendars = await getCalendars();
  if (calendars.length === 0) return [];
  const start = new Date();
  const end = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const events = await listEvents(calendars, start, end);
  return events
    .map((e) => ({
      id: e.id,
      title: e.title,
      startDate: new Date(e.startDate as unknown as string),
      endDate: new Date(e.endDate as unknown as string),
      location: e.location,
    }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export async function createCalendarEvent(title: string, start: Date, end: Date, location?: string) {
  const granted = await ensureCalendarPermission();
  if (!granted) return null;
  const calendar = getDefaultCalendarSync();
  return calendar.createEvent({ title, startDate: start, endDate: end, location });
}
