import { useSharedValue, useFrameCallback } from 'react-native-reanimated';

export interface Particle {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
}

/**
 * Sparse, slow background particles. Sparingly used per the design brief —
 * count is driven by the active performance profile, and can be zero on
 * battery saver.
 */
export function useParticleField(count: number, bounds: { w: number; h: number }) {
  const particles = useSharedValue<Particle[]>(
    Array.from({ length: count }, () => ({
      x: Math.random() * bounds.w,
      y: Math.random() * bounds.h,
      r: 0.6 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.25,
      driftX: (Math.random() - 0.5) * 6,
      driftY: (Math.random() - 0.5) * 6,
    })),
  );

  useFrameCallback((frameInfo) => {
    'worklet';
    if (particles.value.length === 0) return;
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    for (const particle of particles.value) {
      particle.phase += dt * particle.speed;
      particle.x += particle.driftX * dt;
      particle.y += particle.driftY * dt;
      if (particle.x < -20) particle.x = bounds.w + 20;
      if (particle.x > bounds.w + 20) particle.x = -20;
      if (particle.y < -20) particle.y = bounds.h + 20;
      if (particle.y > bounds.h + 20) particle.y = -20;
    }
  }, true);

  return particles;
}
