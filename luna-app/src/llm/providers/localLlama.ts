import { initLlama, type LlamaContext } from 'llama.rn';
import type { ChatMessage, LlmProvider, LocalModelStats, StreamDelta, ToolDefinition, ToolCall } from '../types';

let activeContext: LlamaContext | null = null;
let activeModelUri: string | null = null;
let lastStats: LocalModelStats | null = null;

const CONTEXT_SIZE = 4096;

/** Loads a GGUF model the user already has on their phone. Call once per model change. */
export async function loadLocalModel(
  uri: string,
  name: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (activeContext && activeModelUri === uri) return;
  if (activeContext) {
    await activeContext.release();
    activeContext = null;
  }
  const path = uri.startsWith('file://') ? uri : `file://${uri}`;
  activeContext = await initLlama(
    {
      model: path,
      n_ctx: CONTEXT_SIZE,
      n_gpu_layers: 99, // offload as much as the device backend supports; falls back to CPU automatically
      n_threads: 4,
    },
    onProgress,
  );
  activeModelUri = uri;
  lastStats = {
    modelName: name,
    fileSizeBytes: (activeContext.model as any)?.size ?? 0,
    contextUsed: 0,
    contextMax: CONTEXT_SIZE,
    backend: activeContext.gpu ? 'Vulkan' : 'CPU',
  };
}

export async function unloadLocalModel(): Promise<void> {
  if (activeContext) {
    await activeContext.release();
    activeContext = null;
    activeModelUri = null;
    lastStats = null;
  }
}

export function isLocalModelLoaded(): boolean {
  return !!activeContext;
}

export function getLocalModelStats(): LocalModelStats | null {
  return lastStats;
}

export const localLlamaProvider: LlmProvider = {
  id: 'local',
  displayName: 'Local Model',
  isReady: () => !!activeContext,

  async streamChat(messages: ChatMessage[], tools: ToolDefinition[], onDelta: (d: StreamDelta) => void, signal?: AbortSignal) {
    if (!activeContext) {
      throw new Error('No local model is loaded. Pick a GGUF file in Settings → Local Model.');
    }
    const context = activeContext;

    const oaiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    const oaiTools = tools.length
      ? tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
      : undefined;

    const onAbort = () => {
      context.stopCompletion().catch(() => {});
    };
    signal?.addEventListener('abort', onAbort);

    try {
      const result = await context.completion(
        {
          messages: oaiMessages,
          tools: oaiTools,
          jinja: true,
          n_predict: 512,
          temperature: 0.7,
        },
        (token) => {
          if (token.content) onDelta({ textDelta: token.content });
        },
      );

      if (lastStats) {
        lastStats = {
          ...lastStats,
          contextUsed: result.tokens_evaluated + result.tokens_predicted,
          tokensPerSecond: result.timings?.predicted_per_second,
        };
      }

      if (result.tool_calls?.length) {
        for (const call of result.tool_calls) {
          const toolCall: ToolCall = {
            id: call.id ?? `${call.function.name}-${Date.now()}`,
            name: call.function.name,
            arguments: safeParse(call.function.arguments),
          };
          onDelta({ toolCall });
        }
      }
      onDelta({ done: true, usage: { promptTokens: result.tokens_evaluated, completionTokens: result.tokens_predicted } });
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  },
};

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
