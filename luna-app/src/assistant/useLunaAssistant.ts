import { useCallback, useState } from 'react';
import { useVoicePipeline } from '../voice/useVoicePipeline';
import { getActiveProvider } from '../llm/router';
import { lunaTools, runLunaTool } from '../llm/tools';
import { LUNA_SYSTEM_PROMPT } from './systemPrompt';
import { buildRetrievalPath } from './retrieval';
import { useGraphStore } from '../state/useGraphStore';
import { saveConversationTurn, recentConversation } from '../db/memoryRepo';
import type { ChatMessage } from '../llm/types';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ToolCardState {
  label: string;
  statusText: string;
  active: boolean;
}

const MAX_TOOL_HOPS = 3;

export function useLunaAssistant() {
  const [lastUserText, setLastUserText] = useState('');
  const [lastAssistantText, setLastAssistantText] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [toolCard, setToolCard] = useState<ToolCardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runRetrieval = useGraphStore((s) => s.runRetrieval);
  const clearRetrieval = useGraphStore((s) => s.clearRetrieval);
  const nodes = useGraphStore((s) => s.nodes);

  const handleUserUtterance = useCallback(
    async (text: string) => {
      setError(null);
      setLastUserText(text);
      setStreamingText('');
      await saveConversationTurn('user', text);

      const path = buildRetrievalPath(text, nodes);
      if (path.length > 1) runRetrieval(path);

      voice.setExternalState('thinking');

      const provider = getActiveProvider();
      if (!provider) {
        const message =
          "I don't have a model set up yet. Pick a local model file or add a cloud API key in Settings, and I'll be ready.";
        setLastAssistantText(message);
        await saveConversationTurn('assistant', message);
        voice.setExternalState(null);
        await voice.speak(message);
        clearRetrieval();
        return;
      }

      try {
        const history = await recentConversation(10);
        let messages: ChatMessage[] = [
          { role: 'system', content: LUNA_SYSTEM_PROMPT },
          ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
        ];

        let finalText = '';
        for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
          let hopText = '';
          let pendingToolCall: { id: string; name: string; arguments: Record<string, unknown> } | null = null;

          await provider.streamChat(messages, lunaTools, (delta) => {
            if (delta.textDelta) {
              hopText += delta.textDelta;
              setStreamingText(hopText);
            }
            if (delta.toolCall) {
              pendingToolCall = delta.toolCall;
            }
          });

          if (pendingToolCall) {
            const call = pendingToolCall as { id: string; name: string; arguments: Record<string, unknown> };
            voice.setExternalState('tool');
            setToolCard({ label: call.name.toUpperCase(), statusText: 'Working…', active: true });
            const result = await runLunaTool(call.name, call.arguments);
            setToolCard({ label: result.label, statusText: result.statusText, active: false });
            setTimeout(() => setToolCard(null), 1800);

            messages = [
              ...messages,
              { role: 'assistant', content: hopText, toolCallId: call.id, toolName: call.name },
              { role: 'tool', content: result.resultForModel, toolCallId: call.id, toolName: call.name },
            ];
            voice.setExternalState('thinking');
            continue;
          }

          finalText = hopText;
          break;
        }

        setLastAssistantText(finalText);
        await saveConversationTurn('assistant', finalText);
        voice.setExternalState(null);
        clearRetrieval();
        if (finalText) await voice.speak(finalText);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        setError(message);
        voice.setExternalState('error');
        setTimeout(() => voice.setExternalState(null), 2200);
        clearRetrieval();
      }
    },
    [nodes, runRetrieval, clearRetrieval],
  );

  const voice = useVoicePipeline(handleUserUtterance);

  const sendText = useCallback(
    (text: string) => {
      if (text.trim().length === 0) return;
      handleUserUtterance(text.trim());
    },
    [handleUserUtterance],
  );

  return {
    ...voice,
    lastUserText,
    lastAssistantText,
    streamingText,
    toolCard,
    error,
    sendText,
  };
}
