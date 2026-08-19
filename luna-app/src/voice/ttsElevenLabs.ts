import { File, Paths } from 'expo-file-system';

export interface ElevenLabsVoiceOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Generates speech via the ElevenLabs API and saves it to a local cache
 * file, returning a `file://` URI ready to hand to expo-audio's
 * `createAudioPlayer`. This is Luna's optional premium cloud voice — the
 * device voice (ttsDevice.ts) is the free, offline default.
 */
export async function synthesizeWithElevenLabs(
  text: string,
  { apiKey, voiceId, modelId = 'eleven_turbo_v2_5', stability = 0.45, similarityBoost = 0.8 }: ElevenLabsVoiceOptions,
): Promise<string> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability, similarity_boost: similarityBoost },
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${message}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const file = new File(Paths.cache, `luna-voice-${Date.now()}.mp3`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(arrayBuffer));
  return file.uri;
}

export async function listElevenLabsVoices(apiKey: string) {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!response.ok) throw new Error(`Failed to list voices (${response.status})`);
  const data = await response.json();
  return (data.voices ?? []) as Array<{ voice_id: string; name: string }>;
}
