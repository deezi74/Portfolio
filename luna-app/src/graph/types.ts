import type { GraphCategory } from '../theme/colors';

export type NodeId = string;

export interface GraphNode {
  id: NodeId;
  label: string;
  category: GraphCategory;
  /** Free-text summary shown in the inspector. */
  summary?: string;
  /** Where this fact came from: 'user' | 'device' | 'web' | 'inference' */
  source?: string;
  importance: number; // 0..1, drives node radius
  connections: number; // derived, cached for quick sizing
  lastUpdated: number; // epoch ms
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  /** Pinned nodes are excluded from physics settling (user-dragged). */
  pinned?: boolean;
  /** External web-sourced node, rendered distinctly and pruned after a session. */
  ephemeralWeb?: boolean;
}

export interface GraphEdge {
  id: string;
  source: NodeId;
  target: NodeId;
  strength: number; // 0..1, affects link distance + opacity
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A step in Luna's retrieval/reasoning path, used to animate node illumination. */
export interface RetrievalStep {
  nodeId: NodeId;
  label?: string;
  delayMs: number;
}
