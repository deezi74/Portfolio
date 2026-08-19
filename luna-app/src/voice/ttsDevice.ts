import * as Speech from 'expo-speech';

export interface DeviceVoiceOptions {
  rate?: number;
  pitch?: number;
  voiceIdentifier?: string;
  language?: string;
  /** Fired on each word boundary — used to drive the reactor's speaking pulse. */
  onWordBoundary?: () => void;
}

/** Free, offline, on-device text-to-speech. Always available, no API key required. */
export function speakOnDevice(text: string, options: DeviceVoiceOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      rate: options.rate ?? 1.0,
      pitch: options.pitch ?? 1.0,
      language: options.language ?? 'en-US',
      voice: options.voiceIdentifier,
      onBoundary: () => options.onWordBoundary?.(),
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: (e) => reject(e),
    });
  });
}

export function stopDeviceSpeech(): Promise<void> {
  return Speech.stop();
}

export async function listDeviceVoices() {
  return Speech.getAvailableVoicesAsync();
}
