import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useGraphEngine } from './useGraphEngine';
import { useParticleField } from './useParticleField';
import { useLabelLayout, type LabelMeta } from './useLabelLayout';
import { GraphNodeShape } from './GraphNodeShape';
import { GraphEdgeLine } from './GraphEdgeLine';
import { GraphLabel } from './GraphLabel';
import { GraphParticles } from './GraphParticles';
import type { GraphEdge, GraphNode, NodeId, RetrievalStep } from './types';
import type { PerformanceProfile } from '../theme/tokens';
import { performanceProfiles } from '../theme/tokens';

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  selectedNodeId: NodeId | null;
  retrievalPath?: RetrievalStep[]; // currently-illuminated reasoning path
  dimmed?: boolean; // voice mode / focus mode
  performanceProfile: PerformanceProfile;
  onSelectNode: (id: NodeId | null) => void;
  onOpenDetail: (id: NodeId) => void;
  onOpenActions: (id: NodeId) => void;
}

const HIT_PADDING = 8;

export function GraphCanvas({
  nodes,
  edges,
  width,
  height,
  selectedNodeId,
  retrievalPath = [],
  dimmed = false,
  performanceProfile,
  onSelectNode,
  onOpenDetail,
  onOpenActions,
}: Props) {
  const bounds = useMemo(() => ({ w: width, h: height }), [width, height]);
  const engine = useGraphEngine(bounds);
  const profile = performanceProfiles[performanceProfile];
  const particles = useParticleField(profile.particleCount, bounds);
  const draggingNodeId = useSharedValue<NodeId | null>(null);
  const [illuminatedIds, setIlluminatedIds] = useState<Set<NodeId>>(new Set());

  // Keep the physics world in sync with the data layer.
  useEffect(() => {
    for (const node of nodes) {
      engine.addOrUpdateNode(node, bounds);
    }
    const currentIds = new Set(nodes.map((n) => n.id));
    for (const id of Object.keys(engine.simNodes.value)) {
      if (!currentIds.has(id)) engine.removeNode(id);
    }
  }, [nodes, engine, bounds]);

  useEffect(() => {
    engine.setEdges(edges);
  }, [edges, engine]);

  // Animate retrieval path illumination sequentially.
  useEffect(() => {
    if (retrievalPath.length === 0) {
      setIlluminatedIds(new Set());
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = new Set<NodeId>();
    for (const step of retrievalPath) {
      const timer = setTimeout(() => {
        acc = new Set(acc);
        acc.add(step.nodeId);
        setIlluminatedIds(acc);
        Haptics.selectionAsync().catch(() => {});
      }, step.delayMs);
      timers.push(timer);
    }
    return () => timers.forEach(clearTimeout);
  }, [retrievalPath]);

  const orderedMeta: LabelMeta[] = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => b.importance * (1 + b.connections) - a.importance * (1 + a.connections))
        .map((n) => ({ id: n.id, label: n.label, priority: n.importance * (1 + n.connections) })),
    [nodes],
  );
  const maxLabels = performanceProfile === 'battery' ? 6 : performanceProfile === 'balanced' ? 10 : 16;
  const alwaysShowIds = selectedNodeId ? [selectedNodeId] : [];
  const labelPlacements = useLabelLayout(engine, orderedMeta, bounds, maxLabels, alwaysShowIds);

  function hitTestNode(screenX: number, screenY: number): NodeId | null {
    'worklet';
    const ids = Object.keys(engine.simNodes.value);
    let best: NodeId | null = null;
    let bestDist = Infinity;
    for (const id of ids) {
      const n = engine.simNodes.value[id];
      const sx = n.x * engine.camera.scale.value + engine.camera.tx.value;
      const sy = n.y * engine.camera.scale.value + engine.camera.ty.value;
      const r = n.radius * engine.camera.scale.value + HIT_PADDING;
      const dx = screenX - sx;
      const dy = screenY - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r && dist < bestDist) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
  }

  const panStartCamera = useSharedValue({ tx: 0, ty: 0 });
  const panStartNode = useSharedValue({ x: 0, y: 0 });

  const panGesture = Gesture.Pan()
    .minDistance(2)
    .onStart((e) => {
      const hit = hitTestNode(e.x, e.y);
      if (hit) {
        draggingNodeId.value = hit;
        const n = engine.simNodes.value[hit];
        n.dragging = true;
        panStartNode.value = { x: n.x, y: n.y };
      } else {
        draggingNodeId.value = null;
        panStartCamera.value = { tx: engine.camera.tx.value, ty: engine.camera.ty.value };
      }
    })
    .onUpdate((e) => {
      if (draggingNodeId.value) {
        const n = engine.simNodes.value[draggingNodeId.value];
        if (n) {
          n.x = panStartNode.value.x + e.translationX / engine.camera.scale.value;
          n.y = panStartNode.value.y + e.translationY / engine.camera.scale.value;
          n.vx = 0;
          n.vy = 0;
        }
      } else {
        engine.camera.tx.value = panStartCamera.value.tx + e.translationX;
        engine.camera.ty.value = panStartCamera.value.ty + e.translationY;
      }
    })
    .onEnd(() => {
      if (draggingNodeId.value) {
        const n = engine.simNodes.value[draggingNodeId.value];
        if (n) n.dragging = false;
        draggingNodeId.value = null;
      }
    });

  const pinchStartScale = useSharedValue(1);
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = engine.camera.scale.value;
    })
    .onUpdate((e) => {
      const next = pinchStartScale.value * e.scale;
      engine.camera.scale.value = Math.min(Math.max(next, 0.35), 3.5);
    });

  const singleTap = Gesture.Tap()
    .maxDuration(220)
    .numberOfTaps(1)
    .onEnd((e) => {
      const hit = hitTestNode(e.x, e.y);
      if (hit) {
        runOnJS(onSelectNode)(hit);
        runOnJS(Haptics.selectionAsync)();
      } else {
        runOnJS(onSelectNode)(null);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e) => {
      const hit = hitTestNode(e.x, e.y);
      if (hit) runOnJS(onOpenDetail)(hit);
    });
  singleTap.requireExternalGestureToFail(doubleTap);

  const longPress = Gesture.LongPress()
    .minDuration(420)
    .onStart((e) => {
      const hit = hitTestNode(e.x, e.y);
      if (hit) {
        runOnJS(onOpenActions)(hit);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

  const twoFingerTap = Gesture.Tap()
    .numberOfTaps(1)
    .minPointers(2)
    .onEnd(() => {
      engine.resetView();
      runOnJS(Haptics.selectionAsync)();
    });

  const composedGesture = Gesture.Race(
    twoFingerTap,
    Gesture.Simultaneous(pinchGesture, panGesture),
    Gesture.Exclusive(doubleTap, longPress, singleTap),
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={composedGesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          {profile.particleCount > 0 && <GraphParticles particles={particles} />}

          {edges.map((edge) => (
            <GraphEdgeLine
              key={edge.id}
              edge={edge}
              engine={engine}
              illuminated={illuminatedIds.has(edge.source) && illuminatedIds.has(edge.target)}
              dim={dimmed}
            />
          ))}

          {nodes.map((node) => (
            <GraphNodeShape
              key={node.id}
              id={node.id}
              category={node.category}
              engine={engine}
              selected={selectedNodeId === node.id}
              illuminated={illuminatedIds.has(node.id)}
              dim={dimmed}
            />
          ))}

          {nodes.map((node) => (
            <GraphLabel
              key={node.id}
              id={node.id}
              text={node.label}
              placements={labelPlacements}
              emphasis={selectedNodeId === node.id || illuminatedIds.has(node.id)}
            />
          ))}
        </Canvas>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
