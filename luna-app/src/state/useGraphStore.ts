import { create } from 'zustand';
import type { GraphEdge, GraphNode, NodeId, RetrievalStep } from '../graph/types';
import { loadGraph, upsertNode, addEdge, deleteNode } from '../db/memoryRepo';
import { ensureSeeded } from '../db/seed';

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ready: boolean;
  selectedNodeId: NodeId | null;
  retrievalPath: RetrievalStep[];
  webSourceNodes: GraphNode[]; // ephemeral, shown only while active

  init: () => Promise<void>;
  select: (id: NodeId | null) => void;
  addMemory: (node: GraphNode, linkTo?: NodeId, strength?: number) => Promise<void>;
  removeNode: (id: NodeId) => Promise<void>;
  runRetrieval: (path: RetrievalStep[]) => void;
  clearRetrieval: () => void;
  showWebSources: (nodes: GraphNode[], linkTo: NodeId) => void;
  clearWebSources: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  ready: false,
  selectedNodeId: null,
  retrievalPath: [],
  webSourceNodes: [],

  init: async () => {
    await ensureSeeded();
    const { nodes, edges } = await loadGraph();
    set({ nodes, edges, ready: true });
  },

  select: (id) => set({ selectedNodeId: id }),

  addMemory: async (node, linkTo, strength = 0.5) => {
    await upsertNode(node);
    let edges = get().edges;
    if (linkTo) {
      const edge: GraphEdge = { id: `${linkTo}->${node.id}`, source: linkTo, target: node.id, strength };
      await addEdge(edge);
      edges = [...edges, edge];
    }
    const nodes = [...get().nodes.filter((n) => n.id !== node.id), node];
    set({ nodes, edges });
  },

  removeNode: async (id) => {
    await deleteNode(id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  runRetrieval: (path) => set({ retrievalPath: path }),
  clearRetrieval: () => set({ retrievalPath: [] }),

  showWebSources: (nodes, linkTo) => {
    const edges = nodes.map((n) => ({ id: `${n.id}->${linkTo}`, source: n.id, target: linkTo, strength: 0.4 }));
    set((s) => ({ webSourceNodes: nodes, edges: [...s.edges, ...edges] }));
  },
  clearWebSources: () => {
    const ids = new Set(get().webSourceNodes.map((n) => n.id));
    set((s) => ({
      webSourceNodes: [],
      edges: s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
    }));
  },
}));
