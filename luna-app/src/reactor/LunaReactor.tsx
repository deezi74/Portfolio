import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  Canvas,
  Group,
  Circle,
  Path,
  RadialGradient,
  vec,
  BlurMask,
  Line,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  useFrameCallback,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { reactorState, type ReactorStateName } from '../theme/colors';
import { dashedRingPath, tickMarksPath } from './ringGeometry';

const STATE_SPEED: Record<ReactorStateName, number> = {
  idle: 0.06,
  listening: 0.16,
  thinking: 0.42,
  tool: 0.5,
  speaking: 0.3,
  offline: 0.02,
  error: 0.03,
};

const BAND_COUNT = 28;

export interface LunaReactorProps {
  size: number;
  state: ReactorStateName;
  /** 0..1 live mic amplitude while listening, or synthesized speech level while speaking. */
  amplitude?: SharedValue<number>;
  /** Optional per-band levels (0..1) for a richer frequency-bar look; falls back to synthesized bands from amplitude. */
  bands?: SharedValue<number[]>;
  toolLabel?: string;
  showParticleTrails?: boolean;
  statusText?: string;
}

export function LunaReactor({
  size,
  state,
  amplitude,
  bands,
  toolLabel,
  showParticleTrails = true,
  statusText,
}: LunaReactorProps) {
  const r = size / 2;
  const t = useSharedValue(0);
  const speed = useSharedValue(STATE_SPEED[state]);
  const smoothedAmp = useSharedValue(0);
  const ampFallback = useSharedValue(0);
  const amp = amplitude ?? ampFallback;

  React.useEffect(() => {
    speed.value = withTiming(STATE_SPEED[state], { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [state, speed]);

  useFrameCallback((frame) => {
    'worklet';
    const dt = Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, 1 / 20);
    t.value += dt * (1 + speed.value * 4);
    smoothedAmp.value += (amp.value - smoothedAmp.value) * Math.min(dt * 6, 1);
  }, true);

  const palette = reactorState[state];
  const center = vec(r, r);

  const outerRingPath = useMemo(() => dashedRingPath(r * 0.94, 40, 0.55), [r]);
  const tickPath = useMemo(() => tickMarksPath(r * 0.82, 60, r * 0.05), [r]);
  const processingRingPath = useMemo(() => dashedRingPath(r * 0.7, 10, 0.4), [r]);

  const outerTransform = useDerivedValue(() => [
    { translateX: r },
    { translateY: r },
    { rotate: t.value * speed.value * 2.4 },
  ]);
  const tickTransform = useDerivedValue(() => [
    { translateX: r },
    { translateY: r },
    { rotate: -t.value * speed.value * 1.1 },
  ]);
  const processingTransform = useDerivedValue(() => [
    { translateX: r },
    { translateY: r },
    { rotate: t.value * speed.value * -3.4 },
  ]);
  const processingOpacity = useDerivedValue(() =>
    state === 'thinking' || state === 'tool' ? 0.9 : 0.15,
  );

  const breathScale = useDerivedValue(() => {
    const restBreath = 1 + Math.sin(t.value * 0.9) * (state === 'idle' ? 0.018 : 0.008);
    const ampPush = smoothedAmp.value * 0.12;
    return restBreath + ampPush;
  });

  const audioRingRadius = useDerivedValue(() => r * 0.6 * breathScale.value);
  const audioRingOpacity = useDerivedValue(() =>
    state === 'listening' || state === 'speaking' ? 0.5 + smoothedAmp.value * 0.4 : 0.18,
  );

  const coreRadius = useDerivedValue(() => r * 0.32 * (1 + smoothedAmp.value * 0.08));
  const coreGlowRadius = useDerivedValue(() => r * 0.55 * breathScale.value);
  const coreOpacity = useDerivedValue(() =>
    state === 'offline' ? 0.4 : state === 'error' ? 0.6 : 0.85 + smoothedAmp.value * 0.15,
  );

  const errorPulse = useDerivedValue(() => (state === 'error' ? 0.75 + Math.sin(t.value * 1.6) * 0.08 : 1));

  const bars = useMemo(() => Array.from({ length: BAND_COUNT }, (_, i) => i), []);

  return (
    <View style={{ width: size, height: size + (statusText ? 28 : 0) }}>
      <Canvas style={{ width: size, height: size }}>
        {/* outer glow field behind everything */}
        <Circle c={center} r={r} color={palette.base} opacity={0.12}>
          <RadialGradient c={center} r={r} colors={[palette.base + '55', 'transparent']} />
          <BlurMask blur={24} style="normal" />
        </Circle>

        {/* Layer 1: outer status ring — dashed, slow rotation */}
        <Group transform={outerTransform}>
          <Path path={outerRingPath} style="stroke" strokeWidth={1.5} color={palette.base} opacity={0.55} strokeCap="round" />
        </Group>

        {/* Layer 2: rotating tick marks, opposite direction */}
        <Group transform={tickTransform}>
          <Path path={tickPath} style="stroke" strokeWidth={1} color={palette.base} opacity={0.28} />
        </Group>

        {/* Layer 3: audio-level ring, expands with mic/speech volume */}
        <Circle c={center} r={audioRingRadius} style="stroke" strokeWidth={2} color={palette.bright} opacity={audioRingOpacity}>
          <BlurMask blur={3} style="solid" />
        </Circle>

        {/* Frequency bars around the audio ring */}
        {bars.map((i) => (
          <FreqBar key={i} index={i} count={BAND_COUNT} r={r} amp={smoothedAmp} bands={bands} color={palette.bright} t={t} />
        ))}

        {/* Layer 4: processing ring — brighter arcs, only prominent while thinking/tool */}
        <Group transform={processingTransform}>
          <Path path={processingRingPath} style="stroke" strokeWidth={2.5} color={palette.bright} opacity={processingOpacity} strokeCap="round">
            <BlurMask blur={2} style="solid" />
          </Path>
        </Group>

        {/* Layer 5: inner energy core */}
        <Circle c={center} r={coreGlowRadius} color={palette.base} opacity={useDerivedValue(() => 0.35 * errorPulse.value)}>
          <RadialGradient c={center} r={coreGlowRadius} colors={[palette.bright, palette.base, 'transparent']} positions={[0, 0.4, 1]} />
        </Circle>
        <Circle c={center} r={coreRadius} color={palette.bright} opacity={coreOpacity}>
          <RadialGradient c={center} r={coreRadius} colors={['#FFFFFF', palette.bright]} positions={[0, 1]} />
        </Circle>

        {/* Layer 6: micro-particle orbit around the core (Luna's identity mark) */}
        {showParticleTrails && <OrbitParticles r={r} t={t} color={palette.bright} active={state !== 'offline'} />}
      </Canvas>

      {statusText ? (
        <View style={styles.statusRow} pointerEvents="none">
          <Text style={[styles.statusText, { color: palette.bright }]}>{statusText}</Text>
        </View>
      ) : null}

      {state === 'tool' && toolLabel ? (
        <View style={styles.toolChip} pointerEvents="none">
          <Text style={styles.toolChipText}>{toolLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FreqBar({
  index,
  count,
  r,
  amp,
  bands,
  color,
  t,
}: {
  index: number;
  count: number;
  r: number;
  amp: SharedValue<number>;
  bands?: SharedValue<number[]>;
  color: string;
  t: SharedValue<number>;
}) {
  const angle = (index / count) * Math.PI * 2;
  const inner = r * 0.66;

  const p1 = useDerivedValue(() => vec(r + Math.cos(angle) * inner, r + Math.sin(angle) * inner));
  const p2 = useDerivedValue(() => {
    const synthesized = 0.15 + Math.abs(Math.sin(t.value * (1.4 + (index % 5) * 0.3) + index)) * amp.value;
    const level = bands?.value?.[index] ?? synthesized;
    const len = inner + 4 + level * r * 0.22;
    return vec(r + Math.cos(angle) * len, r + Math.sin(angle) * len);
  });
  const opacity = useDerivedValue(() => 0.25 + amp.value * 0.55);

  return <Line p1={p1} p2={p2} color={color} style="stroke" strokeWidth={2} strokeCap="round" opacity={opacity} />;
}

function OrbitParticles({ r, t, color, active }: { r: number; t: SharedValue<number>; color: string; active: boolean }) {
  const items = useMemo(() => [0, 1, 2], []);
  return (
    <Group>
      {items.map((i) => (
        <OrbitDot key={i} index={i} r={r} t={t} color={color} active={active} />
      ))}
    </Group>
  );
}

function OrbitDot({ index, r, t, color, active }: { index: number; r: number; t: SharedValue<number>; color: string; active: boolean }) {
  const radius = r * 0.42;
  const center = useDerivedValue(() => {
    const a = t.value * 0.7 + (index / 3) * Math.PI * 2;
    return vec(r + Math.cos(a) * radius, r + Math.sin(a) * radius);
  });
  const dotR = useDerivedValue(() => (active ? 2 + Math.sin(t.value * 2 + index) * 0.6 : 1));
  return <Circle c={center} r={dotR} color={color} opacity={active ? 0.8 : 0.25} />;
}

const styles = StyleSheet.create({
  statusRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 3,
  },
  toolChip: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: 'rgba(10,14,18,0.85)',
    borderColor: 'rgba(245,185,76,0.4)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  toolChipText: {
    color: '#F5B94C',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },
});
