import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GlassPanel } from './GlassPanel';
import { cyan, text as textColor } from '../theme';

interface Props {
  onSend: (text: string) => void;
  onMicPress: () => void;
  onVoiceModePress: () => void;
  listening: boolean;
  speaking: boolean;
  onStopSpeaking: () => void;
}

export function CommandBar({ onSend, onMicPress, onVoiceModePress, listening, speaking, onStopSpeaking }: Props) {
  const [value, setValue] = useState('');

  const micScale = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(listening ? 1.12 : 1, { damping: 10, stiffness: 180 }) }],
  }));

  const submit = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <GlassPanel style={styles.panel} intensity={50}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Ask Luna…"
          placeholderTextColor={textColor.tertiary}
          style={styles.input}
          onSubmitEditing={submit}
          returnKeyType="send"
          onFocus={() => Haptics.selectionAsync().catch(() => {})}
        />

        {speaking ? (
          <Pressable onPress={onStopSpeaking} style={[styles.iconButton, styles.stopButton]}>
            <View style={styles.stopSquare} />
          </Pressable>
        ) : (
          <Pressable onPress={onVoiceModePress} style={styles.iconButton}>
            <Text style={styles.iconGlyph}>◎</Text>
          </Pressable>
        )}

        <Animated.View style={micScale}>
          <Pressable
            onPress={onMicPress}
            style={[styles.micButton, listening && styles.micButtonActive]}
          >
            <View style={[styles.micDot, listening && styles.micDotActive]} />
          </Pressable>
        </Animated.View>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 0,
  },
  input: {
    flex: 1,
    color: textColor.primary,
    fontSize: 15,
    paddingVertical: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    color: cyan[400],
    fontSize: 18,
  },
  stopButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#FF5A5F',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,240,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10,240,255,0.25)',
  },
  micButtonActive: {
    backgroundColor: 'rgba(63,224,160,0.16)',
    borderColor: 'rgba(63,224,160,0.5)',
  },
  micDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: cyan[400],
  },
  micDotActive: {
    backgroundColor: '#3FE0A0',
  },
});
