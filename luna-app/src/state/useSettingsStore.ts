import { create } from 'zustand';
import { getJSON, setJSON } from '../settings/secureSettings';
import type { CloudProviderId, ModelSource } from '../llm/types';
import type { PerformanceProfile } from '../theme/tokens';

export interface CloudProviderConfig {
  apiKey: string;
  model: string; // provider-specific model id, e.g. "gpt-4.1", "claude-sonnet-5", "openrouter/auto"
}

export interface LocalModelConfig {
  uri: string | null;
  name: string | null;
  fileSizeBytes: number | null;
}

interface SettingsState {
  hydrated: boolean;
  activeModelSource: ModelSource;
  cloudProviders: Partial<Record<CloudProviderId, CloudProviderConfig>>;
  localModel: LocalModelConfig;

  // Voice
  handsFreeDefault: boolean;
  cloudVoiceEnabled: boolean;
  elevenLabsApiKey: string | null;
  elevenLabsVoiceId: string | null;
  captionsEnabled: boolean;

  // System
  performanceProfile: PerformanceProfile | 'auto';
  oledMode: boolean;
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  parallaxEnabled: boolean;

  hydrate: () => Promise<void>;
  setActiveModelSource: (source: ModelSource) => Promise<void>;
  setCloudProvider: (id: CloudProviderId, config: CloudProviderConfig) => Promise<void>;
  clearCloudProvider: (id: CloudProviderId) => Promise<void>;
  setLocalModel: (config: LocalModelConfig) => Promise<void>;
  setVoiceSettings: (patch: Partial<Pick<SettingsState, 'handsFreeDefault' | 'cloudVoiceEnabled' | 'elevenLabsApiKey' | 'elevenLabsVoiceId' | 'captionsEnabled'>>) => Promise<void>;
  setSystemSettings: (patch: Partial<Pick<SettingsState, 'performanceProfile' | 'oledMode' | 'hapticsEnabled' | 'soundsEnabled' | 'parallaxEnabled'>>) => Promise<void>;
}

const STORAGE_KEY = 'luna.settings.v1';

type Persisted = Pick<
  SettingsState,
  | 'activeModelSource'
  | 'cloudProviders'
  | 'localModel'
  | 'handsFreeDefault'
  | 'cloudVoiceEnabled'
  | 'elevenLabsApiKey'
  | 'elevenLabsVoiceId'
  | 'captionsEnabled'
  | 'performanceProfile'
  | 'oledMode'
  | 'hapticsEnabled'
  | 'soundsEnabled'
  | 'parallaxEnabled'
>;

const defaults: Persisted = {
  activeModelSource: 'local',
  cloudProviders: {},
  localModel: { uri: null, name: null, fileSizeBytes: null },
  handsFreeDefault: false,
  cloudVoiceEnabled: false,
  elevenLabsApiKey: null,
  elevenLabsVoiceId: null,
  captionsEnabled: true,
  performanceProfile: 'auto',
  oledMode: false,
  hapticsEnabled: true,
  soundsEnabled: true,
  parallaxEnabled: true,
};

async function persist(state: SettingsState) {
  const snapshot: Persisted = {
    activeModelSource: state.activeModelSource,
    cloudProviders: state.cloudProviders,
    localModel: state.localModel,
    handsFreeDefault: state.handsFreeDefault,
    cloudVoiceEnabled: state.cloudVoiceEnabled,
    elevenLabsApiKey: state.elevenLabsApiKey,
    elevenLabsVoiceId: state.elevenLabsVoiceId,
    captionsEnabled: state.captionsEnabled,
    performanceProfile: state.performanceProfile,
    oledMode: state.oledMode,
    hapticsEnabled: state.hapticsEnabled,
    soundsEnabled: state.soundsEnabled,
    parallaxEnabled: state.parallaxEnabled,
  };
  await setJSON(STORAGE_KEY, snapshot);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  ...defaults,

  hydrate: async () => {
    const saved = await getJSON<Persisted>(STORAGE_KEY, defaults);
    set({ ...saved, hydrated: true });
  },

  setActiveModelSource: async (source) => {
    set({ activeModelSource: source });
    await persist(get());
  },

  setCloudProvider: async (id, config) => {
    set((s) => ({ cloudProviders: { ...s.cloudProviders, [id]: config } }));
    await persist(get());
  },

  clearCloudProvider: async (id) => {
    set((s) => {
      const next = { ...s.cloudProviders };
      delete next[id];
      return { cloudProviders: next };
    });
    await persist(get());
  },

  setLocalModel: async (config) => {
    set({ localModel: config });
    await persist(get());
  },

  setVoiceSettings: async (patch) => {
    set(patch);
    await persist(get());
  },

  setSystemSettings: async (patch) => {
    set(patch);
    await persist(get());
  },
}));
