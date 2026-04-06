/** Core message type used across AI providers */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: Buffer[];
}

/** Streamed response chunk */
export interface ChatChunk {
  text: string;
  done: boolean;
}

/** Complete response from an AI provider */
export interface ChatResponse {
  text: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Options passed to AI provider calls */
export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/** Model info returned by provider discovery */
export interface ModelInfo {
  id: string;
  name: string;
  supportsVision: boolean;
  contextLength: number;
}

/** AI provider interface — all backends must implement this */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsVision: boolean;
  readonly supportsStreaming: boolean;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse>;

  testConnection(): Promise<boolean>;
  getModels(): Promise<ModelInfo[]>;
}

/** Provider configuration stored per-provider */
export interface ProviderConfig {
  id: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

/** Conversation stored in database */
export interface Conversation {
  id: string;
  title: string;
  gameProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Message within a conversation */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  model?: string;
  tokenCount?: number;
  createdAt: string;
}

/** Game profile for context-aware AI */
export interface GameProfile {
  id: string;
  name: string;
  executablePath?: string;
  systemPrompt?: string;
  captureEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** IPC channel names for main <-> renderer communication */
export type IpcChannel =
  | 'ai:chat'
  | 'ai:stream-chat'
  | 'ai:vision'
  | 'ai:get-providers'
  | 'ai:set-provider'
  | 'ai:test-connection'
  | 'ai:get-models'
  | 'ai:get-provider-configs'
  | 'ai:save-provider-config'
  | 'voice:start-listening'
  | 'voice:stop-listening'
  | 'voice:speak'
  | 'vision:start-capture'
  | 'vision:stop-capture'
  | 'vision:get-sources'
  | 'settings:get'
  | 'settings:set'
  | 'settings:delete'
  | 'settings:get-all'
  | 'conversations:list'
  | 'conversations:get'
  | 'conversations:create'
  | 'conversations:delete'
  | 'conversations:search'
  | 'messages:list'
  | 'messages:add'
  | 'game-profiles:list'
  | 'game-profiles:get'
  | 'game-profiles:create'
  | 'game-profiles:update'
  | 'game-profiles:delete'
  | 'data:export'
  | 'data:wipe'
  | 'avatar:set-expression'
  | 'avatar:set-speaking'
  | 'window:toggle-overlay'
  | 'window:get-overlay'
  | 'window:minimize-to-tray';
