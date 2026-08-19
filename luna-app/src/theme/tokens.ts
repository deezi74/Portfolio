export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const elevation = {
  glass: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  reactor: {
    shadowColor: '#0AF0FF',
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
};

/** Automatic graphics profile — see src/state/usePerformanceStore.ts */
export type PerformanceProfile = 'high' | 'balanced' | 'battery';

export const performanceProfiles: Record<
  PerformanceProfile,
  {
    particleCount: number;
    glowLayers: number;
    blurEnabled: boolean;
    graphAnimatedEdges: boolean;
    reactorParticleTrails: boolean;
    targetFps: number;
  }
> = {
  high: {
    particleCount: 90,
    glowLayers: 3,
    blurEnabled: true,
    graphAnimatedEdges: true,
    reactorParticleTrails: true,
    targetFps: 120,
  },
  balanced: {
    particleCount: 40,
    glowLayers: 2,
    blurEnabled: true,
    graphAnimatedEdges: true,
    reactorParticleTrails: false,
    targetFps: 60,
  },
  battery: {
    particleCount: 0,
    glowLayers: 1,
    blurEnabled: false,
    graphAnimatedEdges: false,
    reactorParticleTrails: false,
    targetFps: 30,
  },
};
