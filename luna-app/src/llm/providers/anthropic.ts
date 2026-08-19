import type { ChatMessage, LlmProvider, StreamDelta, ToolDefinition, ToolCall } from '../types';
import { revealProgressively } from './openaiCompatible';

export function createAnthropicProvider(apiKey: string, model: string): LlmProvider {
  return {
    id: 'anthropic',
    displayName: 'Anthropic',
    isReady: () => !!apiKey && !!model,

    async streamChat(messages: ChatMessage[], tools: ToolDefinition[], onDelta: (d: StreamDelta) => void, signal?: AbortSignal) {
      const system = messages.find((m) => m.role === 'system')?.content;
      const conversation = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content:
            m.role === 'tool'
              ? [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }]
              : m.content,
        }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system,
          messages: conversation,
          tools: tools.length
            ? tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
            : undefined,
        }),
        signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Anthropic error (${response.status}): ${text}`);
      }

      const json = await response.json();
      const blocks: Array<Record<string, any>> = json.content ?? [];

      const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        for (const block of toolUseBlocks) {
          const toolCall: ToolCall = { id: block.id, name: block.name, arguments: block.input ?? {} };
          onDelta({ toolCall });
        }
        onDelta({ done: true });
        return;
      }

      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      await revealProgressively(text, onDelta, signal);
      onDelta({
        done: true,
        usage: { promptTokens: json.usage?.input_tokens, completionTokens: json.usage?.output_tokens },
      });
    },
  };
}
