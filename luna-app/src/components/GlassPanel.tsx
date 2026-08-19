import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { surface, radius } from '../theme';
import { useSettingsStore } from '../state/useSettingsStore';

interface Props extends ViewProps {
  intensity?: number;
}

/** The one reusable translucent surface used for inspectors, sheets, and chips. */
export function GlassPanel({ style, children, intensity = 40, ...rest }: Props) {
  const blurEnabled = useSettingsStore((s) => s.performanceProfile !== 'battery');
  return (
    <View style={[styles.wrapper, style]} {...rest}>
      {blurEnabled && (
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.tint} />
      <View style={styles.innerHighlight} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: surface.glassBorder,
  },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: surface.glass,
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: surface.glassHighlight,
  },
  content: {
    padding: 16,
  },
});
