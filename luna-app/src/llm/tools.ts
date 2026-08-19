import type { ToolDefinition } from './types';
import { useFlashlightStore } from '../tools/flashlight';
import { scheduleReminder } from '../tools/reminders';
import { getUpcomingEvents, createCalendarEvent } from '../tools/calendarTool';
import { rememberNote } from '../tools/notes';

export const lunaTools: ToolDefinition[] = [
  {
    name: 'set_flashlight',
    description: "Turn the phone's flashlight on or off.",
    parameters: {
      type: 'object',
      properties: { on: { type: 'boolean', description: 'true to turn on, false to turn off' } },
      required: ['on'],
    },
  },
  {
    name: 'schedule_reminder',
    description: 'Schedule a local reminder notification for a future time.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        isoDateTime: { type: 'string', description: 'ISO-8601 date-time the reminder should fire' },
      },
      required: ['title', 'isoDateTime'],
    },
  },
  {
    name: 'get_upcoming_events',
    description: "Read the user's upcoming calendar events.",
    parameters: {
      type: 'object',
      properties: { withinDays: { type: 'number', description: 'How many days ahead to look (default 7)' } },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        isoStart: { type: 'string' },
        isoEnd: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['title', 'isoStart', 'isoEnd'],
    },
  },
  {
    name: 'remember',
    description: "Save something to Luna's long-term memory / knowledge graph so it can be recalled later.",
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
      required: ['title', 'body'],
    },
  },
];

export interface ToolRunResult {
  label: string; // shown in the floating tool card, e.g. "FLASHLIGHT"
  statusText: string; // e.g. "Turning on..." then "ON"
  resultForModel: string; // fed back to the LLM as the tool result
}

export async function runLunaTool(name: string, args: Record<string, unknown>): Promise<ToolRunResult> {
  switch (name) {
    case 'set_flashlight': {
      const on = !!args.on;
      const ok = await useFlashlightStore.getState().setOn(on);
      return {
        label: 'FLASHLIGHT',
        statusText: ok ? (on ? 'ON' : 'OFF') : 'PERMISSION DENIED',
        resultForModel: ok ? `Flashlight turned ${on ? 'on' : 'off'}.` : 'Camera permission was denied.',
      };
    }
    case 'schedule_reminder': {
      const at = new Date(String(args.isoDateTime));
      const id = await scheduleReminder({ title: String(args.title), body: args.body ? String(args.body) : undefined, at });
      return {
        label: 'REMINDER',
        statusText: id ? `SET FOR ${at.toLocaleString()}` : 'PERMISSION DENIED',
        resultForModel: id ? `Reminder "${args.title}" scheduled for ${at.toISOString()}.` : 'Notification permission was denied.',
      };
    }
    case 'get_upcoming_events': {
      const events = await getUpcomingEvents(typeof args.withinDays === 'number' ? args.withinDays : 7);
      const summary = events.length
        ? events.map((e) => `${e.title} — ${e.startDate.toLocaleString()}`).join('; ')
        : 'No upcoming events found (or calendar permission not granted).';
      return { label: 'CALENDAR', statusText: `${events.length} EVENTS`, resultForModel: summary };
    }
    case 'create_calendar_event': {
      const start = new Date(String(args.isoStart));
      const end = new Date(String(args.isoEnd));
      const event = await createCalendarEvent(String(args.title), start, end, args.location ? String(args.location) : undefined);
      return {
        label: 'CALENDAR',
        statusText: event ? 'EVENT CREATED' : 'PERMISSION DENIED',
        resultForModel: event ? `Created "${args.title}" on ${start.toLocaleString()}.` : 'Calendar permission was denied.',
      };
    }
    case 'remember': {
      const node = await rememberNote(String(args.title), String(args.body));
      return { label: 'MEMORY', statusText: 'SAVED', resultForModel: `Saved to memory as "${node.label}".` };
    }
    default:
      return { label: name.toUpperCase(), statusText: 'UNKNOWN TOOL', resultForModel: `Unknown tool: ${name}` };
  }
}
