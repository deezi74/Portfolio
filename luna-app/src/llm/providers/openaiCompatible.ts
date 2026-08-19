import type { ChatMessage, LlmProvider, ModelSource, StreamDelta, ToolDefinition, ToolCall } from '../types';

interface OpenAiCompatibleConfig {
  id: ModelSource;
  displayName: string;
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

/** Shared client for the OpenAI Chat Completions wire format — covers OpenAI and OpenRouter. */
export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider {
  return {
    id: config.id,
    displayName: config.displayName,
    isReady: () => !!config.apiKey && !!config.model,

    async streamChat(messages: ChatMessage[], tools: ToolDefinition[], onDelta: (d: StreamDelta) => void, signal?: AbortSignal) {
      const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role === 'tool' ? 'tool' : m.role, content: m.content, tool_call_id: m.toolCallId, name: m.toolName })),
        tools: tools.length
          ? tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
          : undefined,
        stream: false,
      };

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...config.extraHeaders,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`${config.displayName} error (${response.status}): ${text}`);
      }

      const json = await response.json();
      const choice = json.choices?.[0];
      const message = choice?.message;

      if (message?.tool_calls?.length) {
        for (const call of message.tool_calls) {
          const toolCall: ToolCall = {
            id: call.id,
            name: call.function.name,
            arguments: safeParseJson(call.function.arguments),
          };
          onDelta({ toolCall });
        }
        onDelta({ done: true });
        return;
      }

      const text: string = message?.content ?? '';
      await revealProgressively(text, onDelta, signal);
      onDelta({
        done: true,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
        },
      });
    },
  };
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Reveals a full response in small chunks so the UI can show a natural streaming effect even from a non-streaming API call. */
export async function revealProgressively(text: string, onDelta: (d: StreamDelta) => void, signal?: AbortSignal) {
  const words = text.split(/(\s+)/);
  let buffer = '';
  for (const word of words) {
    if (signal?.aborted) return;
    buffer += word;
    if (buffer.length >= 3 || word === words[words.length - 1]) {
      onDelta({ textDelta: buffer });
      buffer = '';
      await new Promise((r) => setTimeout(r, 12));
    }
  }
}
