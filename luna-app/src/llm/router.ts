import { useSettingsStore } from '../state/useSettingsStore';
import { localLlamaProvider } from './providers/localLlama';
import { createOpenAiCompatibleProvider } from './providers/openaiCompatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createGoogleProvider } from './providers/google';
import type { LlmProvider } from './types';

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-5',
  openrouter: 'openrouter/auto',
  google: 'gemini-2.5-flash',
};

/** Builds the currently-active provider from persisted settings. Local model is the default so Luna works with zero setup once a GGUF is loaded. */
export function getActiveProvider(): LlmProvider | null {
  const settings = useSettingsStore.getState();
  const source = settings.activeModelSource;

  if (source === 'local') {
    return localLlamaProvider;
  }

  const config = settings.cloudProviders[source];
  if (!config?.apiKey) return null;
  const model = config.model || DEFAULT_MODELS[source];

  switch (source) {
    case 'openai':
      return createOpenAiCompatibleProvider({
        id: 'openai',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: config.apiKey,
        model,
      });
    case 'openrouter':
      return createOpenAiCompatibleProvider({
        id: 'openrouter',
        displayName: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        model,
        extraHeaders: { 'HTTP-Referer': 'https://luna.assistant', 'X-Title': 'Luna' },
      });
    case 'anthropic':
      return createAnthropicProvider(config.apiKey, model);
    case 'google':
      return createGoogleProvider(config.apiKey, model);
    default:
      return null;
  }
}
