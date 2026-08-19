import { saveNote } from '../db/memoryRepo';
import { useGraphStore } from '../state/useGraphStore';
import type { GraphNode } from '../graph/types';

/**
 * Saves a note both as raw text (notes table) and as a first-class memory
 * node wired into the knowledge graph, so it's something Luna can retrieve
 * and visually point back to later.
 */
export async function rememberNote(title: string, body: string, linkTo = 'you'): Promise<GraphNode> {
  await saveNote(title, body);
  const node: GraphNode = {
    id: `memory-${Date.now()}`,
    label: title.length > 24 ? title.slice(0, 21) + '…' : title,
    category: 'memory',
    summary: body,
    source: 'user',
    importance: 0.45,
    connections: 0,
    lastUpdated: Date.now(),
  };
  await useGraphStore.getState().addMemory(node, linkTo, 0.5);
  return node;
}
