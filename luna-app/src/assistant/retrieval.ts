import type { GraphNode, RetrievalStep } from '../graph/types';

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'was', 'were', 'what', 'when', 'where', 'who', 'that', 'this', 'for', 'and', 'to', 'of', 'my', 'me', 'i', 'on', 'in', 'at', 'do', 'did', 'you', 'luna']);

/**
 * A lightweight local heuristic that picks a plausible path through the
 * knowledge graph for a given utterance, purely to drive the "reasoning"
 * illumination animation — this is not the model's actual retrieval (the
 * model doesn't see the graph), just an honest visualization of "here's
 * roughly what in your world this question touches."
 */
export function buildRetrievalPath(utterance: string, nodes: GraphNode[]): RetrievalStep[] {
  const words = utterance
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  if (words.length === 0 || nodes.length === 0) return [];

  const scored = nodes
    .map((node) => {
      const haystack = `${node.label} ${node.summary ?? ''} ${node.category}`.toLowerCase();
      const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
      return { node, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const path: RetrievalStep[] = [{ nodeId: 'luna-core', delayMs: 0 }];
  scored.forEach((s, i) => {
    path.push({ nodeId: s.node.id, delayMs: 220 * (i + 1) });
  });
  return path;
}
