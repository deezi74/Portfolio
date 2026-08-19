import { getDb } from './database';
import type { GraphEdge, GraphNode, GraphSnapshot, NodeId } from '../graph/types';
import type { GraphCategory } from '../theme/colors';

function rowToNode(row: any): GraphNode {
  return {
    id: row.id,
    label: row.label,
    category: row.category as GraphCategory,
    summary: row.summary ?? undefined,
    source: row.source ?? undefined,
    importance: row.importance,
    connections: row.connections,
    lastUpdated: row.lastUpdated,
    x: row.x ?? undefined,
    y: row.y ?? undefined,
    pinned: !!row.pinned,
    ephemeralWeb: !!row.ephemeralWeb,
  };
}

export async function loadGraph(): Promise<GraphSnapshot> {
  const db = await getDb();
  const nodeRows = await db.getAllAsync('SELECT * FROM nodes WHERE ephemeralWeb = 0');
  const edgeRows = await db.getAllAsync('SELECT * FROM edges');
  return {
    nodes: nodeRows.map(rowToNode),
    edges: edgeRows.map((r: any) => ({
      id: r.id,
      source: r.source,
      target: r.target,
      strength: r.strength,
    })),
  };
}

export async function upsertNode(node: GraphNode): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO nodes (id, label, category, summary, source, importance, connections, lastUpdated, x, y, pinned, ephemeralWeb)
     VALUES ($id, $label, $category, $summary, $source, $importance, $connections, $lastUpdated, $x, $y, $pinned, $ephemeralWeb)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       category = excluded.category,
       summary = excluded.summary,
       source = excluded.source,
       importance = excluded.importance,
       connections = excluded.connections,
       lastUpdated = excluded.lastUpdated,
       x = excluded.x,
       y = excluded.y,
       pinned = excluded.pinned,
       ephemeralWeb = excluded.ephemeralWeb`,
    {
      $id: node.id,
      $label: node.label,
      $category: node.category,
      $summary: node.summary ?? null,
      $source: node.source ?? null,
      $importance: node.importance,
      $connections: node.connections,
      $lastUpdated: node.lastUpdated,
      $x: node.x ?? null,
      $y: node.y ?? null,
      $pinned: node.pinned ? 1 : 0,
      $ephemeralWeb: node.ephemeralWeb ? 1 : 0,
    },
  );
}

export async function addEdge(edge: GraphEdge): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO edges (id, source, target, strength) VALUES ($id, $source, $target, $strength)`,
    { $id: edge.id, $source: edge.source, $target: edge.target, $strength: edge.strength },
  );
  await recomputeConnectionCounts(db, [edge.source, edge.target]);
}

async function recomputeConnectionCounts(db: any, nodeIds: NodeId[]) {
  for (const id of nodeIds) {
    const row = await db.getFirstAsync(
      'SELECT COUNT(*) as c FROM edges WHERE source = ? OR target = ?',
      [id, id],
    );
    await db.runAsync('UPDATE nodes SET connections = ? WHERE id = ?', [row?.c ?? 0, id]);
  }
}

export async function deleteNode(id: NodeId): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM edges WHERE source = ? OR target = ?', [id, id]);
  await db.runAsync('DELETE FROM nodes WHERE id = ?', [id]);
}

export async function saveConversationTurn(
  role: 'user' | 'assistant',
  content: string,
  relatedNodeIds: NodeId[] = [],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO conversations (id, role, content, createdAt, relatedNodeIds) VALUES (?, ?, ?, ?, ?)',
    [`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role, content, Date.now(), JSON.stringify(relatedNodeIds)],
  );
}

export async function recentConversation(limit = 20) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM conversations ORDER BY createdAt DESC LIMIT ?',
    [limit],
  );
  return rows.reverse().map((r: any) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    createdAt: r.createdAt,
  }));
}

export async function saveNote(title: string, body: string, nodeId?: NodeId): Promise<string> {
  const db = await getDb();
  const id = `note-${Date.now()}`;
  await db.runAsync(
    'INSERT INTO notes (id, title, body, createdAt, nodeId) VALUES (?, ?, ?, ?, ?)',
    [id, title, body, Date.now(), nodeId ?? null],
  );
  return id;
}
