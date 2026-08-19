import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { cyan } from '../theme/colors';

/** Brief "a memory formed" pulse — a small bright dot travels up and fades, ~1s total. */
export function MemorySavedToast({ visible }: { visible: boolean }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    opacity.value = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }),
      withDelay(500, withTiming(0, { duration: 350 })),
    );
    progress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [visible, progress, opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: -progress.value * 40 }, { scale: 1 - progress.value * 0.4 }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible) return null;

  return (
    <Animated.View style={styles.wrapper} pointerEvents="none">
      <Animated.View style={[styles.dot, dotStyle]} />
      <Animated.Text style={[styles.text, textStyle]}>MEMORY SAVED</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: cyan[200],
    shadowColor: cyan[400],
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  text: {
    marginTop: 8,
    color: cyan[200],
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },
});
