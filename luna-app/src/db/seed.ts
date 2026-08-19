import { getDb } from './database';
import { upsertNode, addEdge } from './memoryRepo';
import type { GraphNode, GraphEdge } from '../graph/types';

const now = Date.now();

function n(
  id: string,
  label: string,
  category: GraphNode['category'],
  importance: number,
  summary?: string,
): GraphNode {
  return { id, label, category, importance, connections: 0, lastUpdated: now, summary };
}

const seedNodes: GraphNode[] = [
  n('luna-core', 'Luna Core', 'technology', 1, 'Luna’s reasoning core and orchestration layer.'),
  n('model-local', 'Local Model', 'aiModel', 0.7, 'Runs fully on-device. No data leaves your phone.'),
  n('model-cloud', 'Cloud Model', 'aiModel', 0.6, 'Used when you enable a cloud provider and API key.'),
  n('you', 'You', 'person', 0.9, 'This is your world — everything Luna knows connects back here.'),
  n('device', 'This Phone', 'technology', 0.6, 'Sensors, flashlight, notifications, calendar.'),
  n('notes', 'Notes', 'document', 0.5, 'Things you’ve asked Luna to remember.'),
  n('reminders', 'Reminders', 'task', 0.5, 'Scheduled nudges Luna will surface for you.'),
  n('calendar', 'Calendar', 'document', 0.5, 'Your upcoming schedule.'),
];

const seedEdges: Array<[string, string, number]> = [
  ['you', 'luna-core', 0.9],
  ['luna-core', 'model-local', 0.7],
  ['luna-core', 'model-cloud', 0.6],
  ['luna-core', 'device', 0.6],
  ['you', 'notes', 0.6],
  ['you', 'reminders', 0.6],
  ['you', 'calendar', 0.6],
  ['device', 'reminders', 0.4],
  ['device', 'calendar', 0.4],
];

/** Populates a first-run graph so Luna never opens to an empty void. Idempotent. */
export async function ensureSeeded(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM nodes');
  if (existing && existing.c > 0) return;

  for (const node of seedNodes) {
    await upsertNode(node);
  }
  for (const [source, target, strength] of seedEdges) {
    const edge: GraphEdge = { id: `${source}->${target}`, source, target, strength };
    await addEdge(edge);
  }
}
