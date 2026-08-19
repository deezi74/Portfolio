import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type RecognitionStatus = 'idle' | 'listening' | 'error';

export interface UseHandsFreeVoiceResult {
  status: RecognitionStatus;
  handsFree: boolean;
  partialTranscript: string;
  lastFinalTranscript: string;
  /** 0..1, smoothed mic level — feed directly into <LunaReactor amplitude=.../> */
  amplitude: ReturnType<typeof useSharedValue<number>>;
  start: () => Promise<void>;
  stop: () => void;
  setHandsFree: (enabled: boolean) => void;
  requestPermission: () => Promise<boolean>;
}

/**
 * Wraps expo-speech-recognition (Android SpeechRecognizer / iOS Speech) into a
 * hands-free voice loop: when `handsFree` is enabled, the recognizer keeps
 * restarting itself after each utterance so the user never has to tap
 * anything to keep talking to Luna.
 */
export function useHandsFreeVoice(onFinalTranscript: (text: string) => void): UseHandsFreeVoiceResult {
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [lastFinalTranscript, setLastFinalTranscript] = useState('');
  const [handsFree, setHandsFreeState] = useState(false);
  const amplitude = useSharedValue(0);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const requestPermission = useCallback(async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return !!result.granted;
  }, []);

  const start = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      setStatus('error');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
    });
  }, [requestPermission]);

  const stop = useCallback(() => {
    handsFreeRef.current = false;
    setHandsFreeState(false);
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const setHandsFree = useCallback(
    (enabled: boolean) => {
      setHandsFreeState(enabled);
      if (enabled) {
        start();
      } else {
        ExpoSpeechRecognitionModule.stop();
      }
    },
    [start],
  );

  useSpeechRecognitionEvent('start', () => setStatus('listening'));

  useSpeechRecognitionEvent('result', (event) => {
    const best = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      setLastFinalTranscript(best);
      setPartialTranscript('');
      if (best.trim().length > 0) onFinalRef.current(best.trim());
    } else {
      setPartialTranscript(best);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const normalized = Math.min(Math.max(event.value, 0), 10) / 10;
    amplitude.value = normalized;
  });

  useSpeechRecognitionEvent('error', () => {
    setStatus('error');
  });

  useSpeechRecognitionEvent('end', () => {
    amplitude.value = 0;
    if (handsFreeRef.current) {
      // Android sessions end after each utterance even in continuous mode;
      // restart immediately to keep the hands-free loop alive.
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      });
    } else {
      setStatus('idle');
    }
  });

  useEffect(() => {
    return () => {
      handsFreeRef.current = false;
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  return {
    status,
    handsFree,
    partialTranscript,
    lastFinalTranscript,
    amplitude,
    start,
    stop,
    setHandsFree,
    requestPermission,
  };
}
