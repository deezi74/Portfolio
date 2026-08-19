import { useEffect, useMemo, useRef } from 'react';
import { useSharedValue, useFrameCallback, withTiming, Easing } from 'react-native-reanimated';
import type { GraphEdge, GraphNode, NodeId } from './types';
import { stepSimulation, SimNode, SimEdge } from './physics';

const MAX_DT = 1 / 30; // clamp huge frame gaps (e.g. app resume) so nodes don't fly offscreen

export interface GraphEngine {
  simNodes: ReturnType<typeof useSharedValue<Record<NodeId, SimNode>>>;
  simEdges: ReturnType<typeof useSharedValue<SimEdge[]>>;
  camera: {
    tx: ReturnType<typeof useSharedValue<number>>;
    ty: ReturnType<typeof useSharedValue<number>>;
    scale: ReturnType<typeof useSharedValue<number>>;
  };
  /** Bumped every frame to force Skia canvas re-draw reads of simNodes. */
  tick: ReturnType<typeof useSharedValue<number>>;
  addOrUpdateNode: (node: GraphNode, bounds: { w: number; h: number }) => void;
  removeNode: (id: NodeId) => void;
  setEdges: (edges: GraphEdge[]) => void;
  resetView: () => void;
}

export function useGraphEngine(bounds: { w: number; h: number }): GraphEngine {
  const simNodes = useSharedValue<Record<NodeId, SimNode>>({});
  const simEdges = useSharedValue<SimEdge[]>([]);
  const tick = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  useFrameCallback((frameInfo) => {
    'worklet';
    const dt = Math.min((frameInfo.timeSincePreviousFrame ?? 16) / 1000, MAX_DT);
    stepSimulation(simNodes.value, simEdges.value, dt, boundsRef.current);
    // Reassign to trigger dependent useDerivedValue reads in the canvas layer.
    tick.value = tick.value + 1;
  }, true);

  const api = useMemo<Omit<GraphEngine, 'simNodes' | 'simEdges' | 'camera' | 'tick'>>(
    () => ({
      addOrUpdateNode: (node, b) => {
        const existing = simNodes.value[node.id];
        const radius = 18 + node.importance * 22 + Math.min(node.connections, 8) * 1.5;
        if (existing) {
          existing.radius = radius;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.min(b.w, b.h) * (0.15 + Math.random() * 0.25);
          simNodes.value[node.id] = {
            x: node.x ?? b.w / 2 + Math.cos(angle) * r,
            y: node.y ?? b.h / 2 + Math.sin(angle) * r,
            vx: 0,
            vy: 0,
            radius,
            pinned: !!node.pinned,
            dragging: false,
          };
        }
        // Force a shared-value update (mutation alone won't notify watchers).
        simNodes.value = { ...simNodes.value };
      },
      removeNode: (id) => {
        const next = { ...simNodes.value };
        delete next[id];
        simNodes.value = next;
      },
      setEdges: (edges) => {
        simEdges.value = edges.map((e) => ({ source: e.source, target: e.target, strength: e.strength }));
      },
      resetView: () => {
        tx.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
        ty.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
        scale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
      },
    }),
    [simNodes, simEdges, tx, ty, scale],
  );

  return { simNodes, simEdges, camera: { tx, ty, scale }, tick, ...api };
}
