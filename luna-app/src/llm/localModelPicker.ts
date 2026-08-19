import * as DocumentPicker from 'expo-document-picker';
import { loadLocalModel } from './providers/localLlama';
import { useSettingsStore } from '../state/useSettingsStore';

/** Lets the user pick a .gguf file already on their phone and loads it into llama.rn. */
export async function pickAndLoadLocalModel(onProgress?: (pct: number) => void): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', '*/*'],
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return false;

  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith('.gguf')) {
    throw new Error('Please pick a .gguf model file.');
  }

  await loadLocalModel(asset.uri, asset.name, onProgress);
  await useSettingsStore.getState().setLocalModel({
    uri: asset.uri,
    name: asset.name,
    fileSizeBytes: asset.size ?? null,
  });
  return true;
}
