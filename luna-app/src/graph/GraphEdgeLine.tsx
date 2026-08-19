import React from 'react';
import { Group, Line, vec, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { GraphEngine } from './useGraphEngine';
import type { GraphEdge } from './types';
import { cyan } from '../theme/colors';

interface Props {
  edge: GraphEdge;
  engine: GraphEngine;
  illuminated: boolean;
  dim: boolean;
}

export const GraphEdgeLine = React.memo(function GraphEdgeLine({ edge, engine, illuminated, dim }: Props) {
  const p1 = useDerivedValue(() => {
    const n = engine.simNodes.value[edge.source];
    if (!n) return vec(-1000, -1000);
    return vec(n.x * engine.camera.scale.value + engine.camera.tx.value, n.y * engine.camera.scale.value + engine.camera.ty.value);
  }, [engine, edge.source]);

  const p2 = useDerivedValue(() => {
    const n = engine.simNodes.value[edge.target];
    if (!n) return vec(-1000, -1000);
    return vec(n.x * engine.camera.scale.value + engine.camera.tx.value, n.y * engine.camera.scale.value + engine.camera.ty.value);
  }, [engine, edge.target]);

  const opacity = useDerivedValue(
    () => (illuminated ? 0.9 : dim ? 0.04 : 0.12 + edge.strength * 0.18),
  );

  const color = illuminated ? cyan[400] : 'rgba(150, 200, 215, 1)';

  return (
    <Group>
      <Line p1={p1} p2={p2} color={color} style="stroke" strokeWidth={illuminated ? 2 : 1} opacity={opacity}>
        {illuminated && <BlurMask blur={4} style="solid" />}
      </Line>
    </Group>
  );
});
