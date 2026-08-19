import React from 'react';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LunaReactor } from '../reactor/LunaReactor';
import type { ReactorStateName } from '../theme/colors';
import { text as textColor, cyan, type as t } from '../theme';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  visible: boolean;
  state: ReactorStateName;
  amplitude: SharedValue<number>;
  handsFree: boolean;
  partialTranscript: string;
  lastUserText: string;
  lastAssistantText: string;
  streamingText: string;
  captionsEnabled: boolean;
  onToggleHandsFree: () => void;
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export function VoiceModeOverlay({
  visible,
  state,
  amplitude,
  handsFree,
  partialTranscript,
  lastUserText,
  lastAssistantText,
  streamingText,
  captionsEnabled,
  onToggleHandsFree,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const statusText =
    state === 'listening' ? 'LISTENING' : state === 'thinking' ? 'THINKING' : state === 'speaking' ? 'SPEAKING' : state === 'tool' ? 'WORKING' : 'READY';

  return (
    <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(200)} style={styles.container}>
      <Pressable style={styles.closeArea} onPress={onClose} hitSlop={16}>
        <Text style={styles.closeGlyph}>︿</Text>
      </Pressable>

      <View style={styles.reactorWrap}>
        <LunaReactor size={Math.min(width * 0.62, 260)} state={state} amplitude={amplitude} statusText={statusText} />
      </View>

      {captionsEnabled && (
        <View style={styles.captions}>
          {partialTranscript ? <Text style={styles.userCaption}>“{partialTranscript}”</Text> : null}
          {!partialTranscript && lastUserText ? <Text style={styles.userCaptionDim}>“{lastUserText}”</Text> : null}
          {(streamingText || lastAssistantText) ? (
            <View style={styles.assistantBlock}>
              <Text style={styles.assistantLabel}>LUNA</Text>
              <Text style={styles.assistantCaption}>{streamingText || lastAssistantText}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={onToggleHandsFree} style={[styles.handsFreeButton, handsFree && styles.handsFreeActive]}>
          <Text style={[styles.handsFreeText, handsFree && styles.handsFreeTextActive]}>
            {handsFree ? 'HANDS-FREE ON' : 'HANDS-FREE OFF'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(1,3,5,0.88)',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  closeArea: {
    marginTop: 60,
    padding: 12,
  },
  closeGlyph: {
    color: textColor.secondary,
    fontSize: 22,
  },
  reactorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  captions: {
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 14,
    maxHeight: 220,
  },
  userCaption: {
    ...t.body,
    color: textColor.primary,
    textAlign: 'center',
  },
  userCaptionDim: {
    ...t.body,
    color: textColor.tertiary,
    textAlign: 'center',
  },
  assistantBlock: {
    alignItems: 'center',
    gap: 4,
  },
  assistantLabel: {
    ...t.hudLabel,
    color: cyan[400],
  },
  assistantCaption: {
    ...t.body,
    color: textColor.primary,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
  },
  handsFreeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  handsFreeActive: {
    borderColor: 'rgba(63,224,160,0.5)',
    backgroundColor: 'rgba(63,224,160,0.1)',
  },
  handsFreeText: {
    ...t.hudLabel,
    color: textColor.secondary,
  },
  handsFreeTextActive: {
    color: '#3FE0A0',
  },
});
