import React, { useMemo } from 'react';
import {
  Group,
  Circle,
  Path,
  RadialGradient,
  vec,
  BlurMask,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { GraphEngine } from './useGraphEngine';
import type { NodeId } from './types';
import { categoryPalette, type GraphCategory } from '../theme/colors';
import { glyphForCategory } from './nodeGlyphs';

interface Props {
  id: NodeId;
  category: GraphCategory;
  engine: GraphEngine;
  selected: boolean;
  illuminated: boolean; // part of an active retrieval path
  dim: boolean; // graph dimmed (e.g. voice mode / filtered out)
}

export const GraphNodeShape = React.memo(function GraphNodeShape({
  id,
  category,
  engine,
  selected,
  illuminated,
  dim,
}: Props) {
  const palette = categoryPalette[category] ?? categoryPalette.general;
  const glyph = useMemo(() => glyphForCategory(category), [category]);

  const screen = useDerivedValue(() => {
    const node = engine.simNodes.value[id];
    if (!node) return { x: -1000, y: -1000, r: 0 };
    return {
      x: node.x * engine.camera.scale.value + engine.camera.tx.value,
      y: node.y * engine.camera.scale.value + engine.camera.ty.value,
      r: node.radius * engine.camera.scale.value,
    };
  }, [engine, id]);

  const center = useDerivedValue(() => vec(screen.value.x, screen.value.y));
  const radius = useDerivedValue(() => screen.value.r);
  const haloRadius = useDerivedValue(() => screen.value.r * 1.9);

  const coreOpacity = useDerivedValue(() => (dim && !selected && !illuminated ? 0.35 : 1));
  const glowOpacity = useDerivedValue(() =>
    (illuminated ? 0.9 : selected ? 0.75 : dim ? 0.08 : 0.3),
  );

  const glyphTransform = useDerivedValue(() => [
    { translateX: screen.value.x },
    { translateY: screen.value.y },
    { scale: screen.value.r * 0.62 },
  ]);

  const ringRadius = useDerivedValue(() => screen.value.r + 6);
  const ringOpacity = useDerivedValue(() => (selected ? 0.9 : illuminated ? 0.6 : 0));

  return (
    <Group>
      {/* Outer translucent halo */}
      <Circle c={center} r={haloRadius} color={palette.base} opacity={glowOpacity}>
        <RadialGradient
          c={center}
          r={haloRadius}
          colors={[palette.glow, 'transparent']}
        />
        <BlurMask blur={illuminated ? 14 : 8} style="normal" />
      </Circle>

      {/* Core node body */}
      <Circle c={center} r={radius} color={palette.base} opacity={coreOpacity}>
        <RadialGradient
          c={useDerivedValue(() => vec(screen.value.x - screen.value.r * 0.3, screen.value.y - screen.value.r * 0.3))}
          r={radius}
          colors={['#FFFFFF', palette.base, palette.base]}
          positions={[0, 0.35, 1]}
        />
      </Circle>

      {/* Depth rim */}
      <Circle c={center} r={radius} style="stroke" strokeWidth={1} color="rgba(0,0,0,0.35)" opacity={coreOpacity} />

      {/* Glyph */}
      <Group transform={glyphTransform}>
        <Path path={glyph} style="stroke" strokeWidth={0.16} color="#04141A" opacity={coreOpacity} strokeCap="round" strokeJoin="round" />
      </Group>

      {/* Selection / illumination ring */}
      <Circle c={center} r={ringRadius} style="stroke" strokeWidth={2} color="#FFFFFF" opacity={ringOpacity} />
    </Group>
  );
});
