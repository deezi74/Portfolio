import type { ChatMessage, LlmProvider, StreamDelta, ToolDefinition, ToolCall } from '../types';
import { revealProgressively } from './openaiCompatible';

export function createGoogleProvider(apiKey: string, model: string): LlmProvider {
  return {
    id: 'google',
    displayName: 'Google',
    isReady: () => !!apiKey && !!model,

    async streamChat(messages: ChatMessage[], tools: ToolDefinition[], onDelta: (d: StreamDelta) => void, signal?: AbortSignal) {
      const system = messages.find((m) => m.role === 'system')?.content;
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts:
            m.role === 'tool'
              ? [{ functionResponse: { name: m.toolName, response: { result: m.content } } }]
              : [{ text: m.content }],
        }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            tools: tools.length
              ? [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
              : undefined,
          }),
          signal,
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Google error (${response.status}): ${text}`);
      }

      const json = await response.json();
      const parts: Array<Record<string, any>> = json.candidates?.[0]?.content?.parts ?? [];

      const functionCalls = parts.filter((p) => p.functionCall);
      if (functionCalls.length > 0) {
        for (const part of functionCalls) {
          const toolCall: ToolCall = {
            id: `${part.functionCall.name}-${Date.now()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          };
          onDelta({ toolCall });
        }
        onDelta({ done: true });
        return;
      }

      const text = parts.map((p) => p.text ?? '').join('');
      await revealProgressively(text, onDelta, signal);
      onDelta({
        done: true,
        usage: {
          promptTokens: json.usageMetadata?.promptTokenCount,
          completionTokens: json.usageMetadata?.candidatesTokenCount,
        },
      });
    },
  };
}
