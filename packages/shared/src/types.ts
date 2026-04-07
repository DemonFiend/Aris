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

  // Privacy consent
  screenCaptureConsented: boolean;

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

/** Companion persona union types */
export type PersonaTone = 'cheerful' | 'warm' | 'calm' | 'playful' | 'professional' | 'dry' | 'dramatic';
export type PersonaTraits = 'supportive' | 'curious' | 'friendly' | 'confident' | 'mischievous' | 'reserved' | 'protective' | 'chaotic';
export type InteractionFrequency = 'only-when-spoken-to' | 'occasionally-initiates' | 'frequently-initiates';
export type HumorLevel = 'none' | 'light' | 'witty' | 'sarcastic' | 'chaotic';
export type ExpressivenessLevel = 'low' | 'medium' | 'high';
export type AdvancedModifier = 'observant' | 'clingy' | 'shy' | 'bold' | 'flirty' | 'blunt' | 'affectionate' | 'competitive' | 'energetic' | 'patient';

export const TONE_OPTIONS: PersonaTone[] = ['cheerful', 'warm', 'calm', 'playful', 'professional', 'dry', 'dramatic'];
export const TRAITS_OPTIONS: PersonaTraits[] = ['supportive', 'curious', 'friendly', 'confident', 'mischievous', 'reserved', 'protective', 'chaotic'];
export const INTERACTION_FREQUENCY_OPTIONS: InteractionFrequency[] = ['only-when-spoken-to', 'occasionally-initiates', 'frequently-initiates'];
export const HUMOR_OPTIONS: HumorLevel[] = ['none', 'light', 'witty', 'sarcastic', 'chaotic'];
export const EXPRESSIVENESS_OPTIONS: ExpressivenessLevel[] = ['low', 'medium', 'high'];
export const ADVANCED_MODIFIER_OPTIONS: AdvancedModifier[] = ['observant', 'clingy', 'shy', 'bold', 'flirty', 'blunt', 'affectionate', 'competitive', 'energetic', 'patient'];

/** Companion personality configuration */
export interface CompanionPersonality {
  name: string;
  greeting: string;
  responseStyle: 'casual' | 'formal' | 'playful' | 'serious';
  defaultExpression: 'neutral' | 'happy' | 'thinking';
  mode: 'simple' | 'advanced';
  tone: PersonaTone;
  traits: PersonaTraits;
  interactionFrequency: InteractionFrequency;
  humor: HumorLevel;
  expressiveness: ExpressivenessLevel;
  advancedModifiers: AdvancedModifier[];
  customPrompt: string | null;
  activePreset: 'supportive-gamer' | 'sassy-gamer' | null;
}

/** Companion idle behavior settings */
export interface CompanionIdleBehavior {
  enabled: boolean;              // master on/off for idle animations
  mode: 'beginner' | 'advanced'; // beginner = single toggle, advanced = full sliders
  breathingIntensity: number;    // 0-1, scales idle breathing animation
  swayIntensity: number;         // 0-1, scales head sway
  blinkFrequency: number;        // average seconds between blinks (2-10)
  expressionSensitivity: number; // 0-1, how easily expressions trigger from text
  bodyIntensity: number;         // 0-1, scales full-body idle motions (hips, spine, arms, shoulders)
  variationFrequency: number;    // 0-1, how frequently idle variations fire (stretch, glance, settle)
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
    mode: 'simple',
    tone: 'cheerful',
    traits: 'friendly',
    interactionFrequency: 'occasionally-initiates',
    humor: 'light',
    expressiveness: 'medium',
    advancedModifiers: [],
    customPrompt: null,
    activePreset: null,
  },
  idle: {
    enabled: true,
    mode: 'beginner',
    breathingIntensity: 1.0,
    swayIntensity: 1.0,
    blinkFrequency: 4,
    expressionSensitivity: 0.5,
    bodyIntensity: 1.0,
    variationFrequency: 0.5,
  },
  defaultAvatar: null,
  ttsVoice: null,
  wakeWord: null,
};

/** Screen position awareness mode */
export type ScreenPositionMode = 'disabled' | 'auto' | 'custom';

/** Info about a connected monitor */
export interface MonitorInfo {
  id: number;
  label: string;
  index: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

/** Full screen position state */
export interface ScreenPositionState {
  mode: ScreenPositionMode;
  monitors: MonitorInfo[];
  positions: Record<number, number | null>;
  activeMonitorIndex: number | null;
  activeGridCell: number | null;
  globalPosition: number | null;
}

/** Dock position of the app window relative to screen edges */
export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'floating' | 'fullscreen';

/** Screen quadrant the window center occupies */
export type ScreenQuadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

/** Position context describing the app's physical location on screen */
export interface PositionContext {
  dockPosition: DockPosition;
  screenQuadrant: ScreenQuadrant;
  overlayMode: boolean;
  windowBounds: { x: number; y: number; width: number; height: number };
  screenBounds: { width: number; height: number };
}

/** Gaze mode for the avatar's eye/head direction */
export type GazeMode = 'idle' | 'speaking' | 'listening' | 'awareness';

/** Password lock configuration */
export interface PasswordConfig {
  enabled: boolean;
  hasPassword: boolean;
  onEnable: boolean;
  onStart: boolean;
  useSamePassword: boolean;
  hasStartupPassword: boolean;
}

/** Virtual space configuration — ground plane, shadows, and scene environment */
export interface VirtualSpaceConfig {
  enabled: boolean;
  groundSize: [number, number];
  groundMaterial: 'grid' | 'solid' | 'textured';
  groundColor: string;
  fogEnabled: boolean;
  backgroundMode: 'transparent' | 'solid' | 'gradient';
  backgroundColor: string;
}

export const DEFAULT_VIRTUAL_SPACE_CONFIG: VirtualSpaceConfig = {
  enabled: false,
  groundSize: [5, 5],
  groundMaterial: 'grid',
  groundColor: '#1a1a2e',
  fogEnabled: false,
  backgroundMode: 'transparent',
  backgroundColor: '#0a0a1a',
};

/** IPC channel names for main <-> renderer communication */
export type IpcChannel =
  | 'ai:chat'
  | 'ai:stream-chat'
  | 'ai:vision'
  | 'ai:get-providers'
  | 'ai:set-provider'
  | 'ai:get-active-provider'
  | 'ai:clear-provider'
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
  | 'vision:get-capture-consent'
  | 'vision:set-capture-consent'
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
  | 'data:export-encrypted'
  | 'data:import-encrypted'
  | 'data:wipe'
  | 'avatar:set-expression'
  | 'avatar:set-speaking'
  | 'avatar:list-available'
  | 'avatar:get-default'
  | 'avatar:set-default'
  | 'avatar:open-folder'
  | 'avatar:import'
  | 'avatar:delete'
  | 'avatar:get-space-config'
  | 'avatar:set-space-config'
  | 'companion:get-config'
  | 'companion:set-config'
  | 'password:get-config'
  | 'password:set-password'
  | 'password:set-startup-password'
  | 'password:verify'
  | 'password:set-config'
  | 'password:remove'
  | 'window:toggle-overlay'
  | 'window:get-overlay'
  | 'window:get-position-context'
  | 'window:minimize-to-tray'
  | 'window:quit'
  | 'screen:get-monitors'
  | 'screen:get-position-state'
  | 'screen:set-mode'
  | 'screen:set-custom-position';
