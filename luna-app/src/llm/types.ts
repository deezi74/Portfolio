export type CloudProviderId = 'openai' | 'anthropic' | 'openrouter' | 'google';
export type ModelSource = 'local' | CloudProviderId;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StreamDelta {
  textDelta?: string;
  toolCall?: ToolCall;
  done?: boolean;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LlmProvider {
  id: ModelSource;
  displayName: string;
  /** True once configured (API key present, or local model loaded). */
  isReady(): Promise<boolean> | boolean;
  streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onDelta: (delta: StreamDelta) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface LocalModelStats {
  modelName: string;
  fileSizeBytes: number;
  ramUsageMb?: number;
  contextUsed: number;
  contextMax: number;
  tokensPerSecond?: number;
  backend: 'CPU' | 'Vulkan' | 'Metal';
  thermalWarning?: boolean;
}
