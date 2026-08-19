import { useCallback, useRef, useState } from 'react';
import { useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { createAudioPlayer, useAudioSampleListener, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useHandsFreeVoice } from './recognition';
import { speakOnDevice, stopDeviceSpeech } from './ttsDevice';
import { synthesizeWithElevenLabs } from './ttsElevenLabs';
import { useSettingsStore } from '../state/useSettingsStore';
import type { ReactorStateName } from '../theme/colors';

export type LunaVoiceState = ReactorStateName;

export interface UseVoicePipelineResult {
  reactorState: LunaVoiceState;
  amplitude: ReturnType<typeof useSharedValue<number>>;
  partialTranscript: string;
  lastFinalTranscript: string;
  handsFree: boolean;
  toggleHandsFree: () => void;
  speak: (text: string) => Promise<void>;
  interrupt: () => Promise<void>;
  setExternalState: (state: LunaVoiceState | null) => void;
}

/**
 * The single source of truth for Luna's voice loop: mic in -> reactor
 * amplitude -> speech out. `onUserUtterance` receives finished transcripts
 * to hand to the LLM router; `speak()` is what the assistant calls once it
 * has a reply.
 */
export function useVoicePipeline(onUserUtterance: (text: string) => void): UseVoicePipelineResult {
  const [explicitState, setExplicitState] = useState<LunaVoiceState | null>(null);
  const settings = useSettingsStore();
  const playerRef = useRef<AudioPlayer | null>(null);
  const speakAmplitude = useSharedValue(0);

  const recognition = useHandsFreeVoice(onUserUtterance);

  const derivedState: LunaVoiceState =
    explicitState ??
    (recognition.status === 'listening' ? 'listening' : 'idle');

  const amplitude = recognition.status === 'listening' ? recognition.amplitude : speakAmplitude;

  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = createAudioPlayer(null);
    }
    return playerRef.current;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      setExplicitState('speaking');
      try {
        if (settings.cloudVoiceEnabled && settings.elevenLabsApiKey && settings.elevenLabsVoiceId) {
          const uri = await synthesizeWithElevenLabs(text, {
            apiKey: settings.elevenLabsApiKey,
            voiceId: settings.elevenLabsVoiceId,
          });
          const player = ensurePlayer();
          player.replace({ uri });
          player.play();
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              if (!player.playing) {
                clearInterval(check);
                resolve();
              }
            }, 150);
          });
        } else {
          // Free on-device voice. There's no raw waveform to read here, so we
          // pulse the reactor per spoken word via onBoundary — an honest
          // approximation of "reacting to her voice" without fabricating data.
          await speakOnDeviceWithPulses(text, speakAmplitude);
        }
      } finally {
        speakAmplitude.value = withTiming(0, { duration: 200 });
        setExplicitState(null);
      }
    },
    [settings.cloudVoiceEnabled, settings.elevenLabsApiKey, settings.elevenLabsVoiceId, ensurePlayer, speakAmplitude],
  );

  useAudioSampleListener(ensurePlayer(), (sample) => {
    const frames = sample.channels[0]?.frames ?? [];
    if (frames.length === 0) return;
    let sumSq = 0;
    for (const f of frames) sumSq += f * f;
    const rms = Math.sqrt(sumSq / frames.length);
    speakAmplitude.value = Math.min(rms * 3.2, 1);
  });

  const interrupt = useCallback(async () => {
    await stopDeviceSpeech();
    playerRef.current?.pause();
    speakAmplitude.value = withTiming(0, { duration: 150 });
    setExplicitState(null);
  }, [speakAmplitude]);

  const toggleHandsFree = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    recognition.setHandsFree(!recognition.handsFree);
  }, [recognition]);

  return {
    reactorState: derivedState,
    amplitude,
    partialTranscript: recognition.partialTranscript,
    lastFinalTranscript: recognition.lastFinalTranscript,
    handsFree: recognition.handsFree,
    toggleHandsFree,
    speak,
    interrupt,
    setExternalState: setExplicitState,
  };
}

async function speakOnDeviceWithPulses(text: string, amplitude: ReturnType<typeof useSharedValue<number>>) {
  await speakOnDevice(text, {
    onWordBoundary: () => {
      // Short attack, decay back to rest — an honest per-word "talking" pulse
      // since on-device TTS exposes no real waveform to sample.
      amplitude.value = 0.55 + Math.random() * 0.35;
      amplitude.value = withDecay({ velocity: -3.2, clamp: [0, 1] });
    },
  });
  amplitude.value = withTiming(0, { duration: 150 });
}
