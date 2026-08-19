import * as SecureStore from 'expo-secure-store';

/** Thin JSON wrapper over SecureStore — all API keys and provider config live only on-device, encrypted at rest. */
export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}
