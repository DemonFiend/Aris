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

/** Available capture source (screen or window) */
export interface CaptureSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  isScreen: boolean;
}

/** Capture configuration */
export interface CaptureConfig {
  sourceId: string;
  fps: number;
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;
}

/** Capture status reported to renderer */
export interface CaptureStatus {
  active: boolean;
  sourceId?: string;
  sourceName?: string;
  fps: number;
  frameCount: number;
  detectedGame?: string;
}

/** Persistent capture settings stored in settings DB */
export interface CaptureSettings {
  // Source preferences
  captureMode: 'monitor' | 'window';
  preferredSourceId?: string;

  // Capture quality
  fps: number;
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;

  // Screenshot storage
  saveToDisk: boolean;
  screenshotFolder: string;
  maxScreenshots: number;
  pruneIntervalMinutes: number;
  folderSizeLimitMb: number;

  // Heartbeat captures
  heartbeatEnabled: boolean;
  heartbeatIntervalSeconds: number;

  // Video options
  videoEnabled: boolean;
  videoMaxDurationSeconds: number;
  videoFps: number;
  videoQuality: 'low' | 'medium' | 'high';
}

/** Screenshot file info returned from main process */
export interface ScreenshotInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  detectedGame?: string;
}

/** Screenshot folder stats */
export interface ScreenshotFolderStats {
  totalFiles: number;
  totalSizeMb: number;
  oldestFile?: string;
  newestFile?: string;
}

/** Voice pipeline configuration */
export interface VoiceConfig {
  sttEngine: 'web-speech' | 'whisper-local' | 'cloud';
  ttsEngine: 'web-speech' | 'piper-local' | 'cloud';
  language: string;
  pushToTalk: boolean;
  pushToTalkKey: string;
  vadEnabled: boolean;
  vadThreshold: number;
  ttsRate: number;
  ttsPitch: number;
}

/** Voice session status */
export interface VoiceStatus {
  listening: boolean;
  speaking: boolean;
  sttEngine: string;
  ttsEngine: string;
  error?: string;
}

/** Available avatar model */
export interface AvatarInfo {
  filename: string;
  name: string;
  isDefault: boolean;
}

/** Companion personality configuration */
export interface CompanionPersonality {
  name: string;
  greeting: string;
  responseStyle: 'casual' | 'formal' | 'playful' | 'serious';
  defaultExpression: 'neutral' | 'happy' | 'thinking';
}

/** Companion idle behavior settings */
export interface CompanionIdleBehavior {
  breathingIntensity: number;    // 0-1, scales idle breathing animation
  swayIntensity: number;         // 0-1, scales head sway
  blinkFrequency: number;        // average seconds between blinks (2-10)
  expressionSensitivity: number; // 0-1, how easily expressions trigger from text
}

/** Full companion config — extensible with sensible defaults */
export interface CompanionConfig {
  personality: CompanionPersonality;
  idle: CompanionIdleBehavior;
  defaultAvatar: string | null;
  ttsVoice: string | null;
  wakeWord: string | null;
}

export const DEFAULT_COMPANION_CONFIG: CompanionConfig = {
  personality: {
    name: 'Aris',
    greeting: 'Hey! Ready to game?',
    responseStyle: 'casual',
    defaultExpression: 'neutral',
  },
  idle: {
    breathingIntensity: 1.0,
    swayIntensity: 1.0,
    blinkFrequency: 4,
    expressionSensitivity: 0.5,
  },
  defaultAvatar: null,
  ttsVoice: null,
  wakeWord: null,
};

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
  | 'voice:stop-speaking'
  | 'voice:get-status'
  | 'voice:get-config'
  | 'voice:set-config'
  | 'voice:get-voices'
  | 'vision:start-capture'
  | 'vision:stop-capture'
  | 'vision:get-sources'
  | 'vision:get-status'
  | 'vision:analyze-frame'
  | 'vision:get-capture-settings'
  | 'vision:set-capture-settings'
  | 'vision:get-screenshot-stats'
  | 'vision:prune-screenshots'
  | 'vision:open-screenshot-folder'
  | 'vision:pick-screenshot-folder'
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
  | 'avatar:list-available'
  | 'avatar:get-default'
  | 'avatar:set-default'
  | 'avatar:open-folder'
  | 'avatar:import'
  | 'avatar:delete'
  | 'companion:get-config'
  | 'companion:set-config'
  | 'window:toggle-overlay'
  | 'window:get-overlay'
  | 'window:minimize-to-tray';
