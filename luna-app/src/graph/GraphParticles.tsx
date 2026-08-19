import React from 'react';
import { Circle, Group, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Particle } from './useParticleField';

/** Ambient background particles — screen-space, independent of graph camera. */
export function GraphParticles({ particles }: { particles: SharedValue<Particle[]> }) {
  const count = particles.value.length;
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => (
        <ParticleDot key={i} index={i} particles={particles} />
      ))}
    </Group>
  );
}

const ParticleDot = React.memo(function ParticleDot({
  index,
  particles,
}: {
  index: number;
  particles: SharedValue<Particle[]>;
}) {
  const center = useDerivedValue(() => {
    const p = particles.value[index];
    return p ? vec(p.x, p.y) : vec(-100, -100);
  });
  const opacity = useDerivedValue(() => {
    const p = particles.value[index];
    return p ? 0.15 + Math.sin(p.phase) * 0.12 : 0;
  });
  const r = useDerivedValue(() => particles.value[index]?.r ?? 0);

  return <Circle c={center} r={r} color="#8FEFFF" opacity={opacity} />;
});
