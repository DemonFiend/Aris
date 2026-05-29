/** STT engine interface — all speech-to-text backends must implement this */
export interface STTEngine {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;

  start(language: string): void;
  stop(): void;
  isListening(): boolean;

  onResult: ((transcript: string, isFinal: boolean) => void) | null;
  onError: ((error: string) => void) | null;
}

/**
 * Renderer-side TTS engine interface (Web Speech API).
 * Runs in a browser context where speechSynthesis is available.
 */
export interface TTSEngine {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;

  speak(text: string, options?: TTSOptions): void;
  stop(): void;
  isSpeaking(): boolean;
  getVoices(): TTSVoice[];

  onStart: (() => void) | null;
  onEnd: (() => void) | null;
  onError: ((error: string) => void) | null;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  isLocal: boolean;
}

/**
 * Server-side TTS provider interface — for HTTP-based engines like Kokoro and
 * Fish Speech that synthesize audio in the main process and stream PCM/WAV
 * back to the renderer for playback.
 *
 * Mirrors the shape of @aris/ai-core's AIProvider so the registry follows the
 * same lifecycle (register → setActive → synth).
 */
/**
 * Hardware class a TTS provider is designed for. Used by the settings UI to
 * group providers, label them with badges, and gate GPU-class providers when
 * the user's machine doesn't have a compatible runtime.
 *
 * - 'cpu'    — light enough to run alongside a game on integrated graphics
 *              (Kokoro, Piper)
 * - 'gpu'    — needs a discrete GPU with several GB of VRAM
 *              (Fish Speech, XTTS-v2)
 * - 'cloud'  — hosted; latency + per-request cost in exchange for quality
 *              (reserved — no providers ship in this class yet)
 */
export type TTSHardwareClass = 'cpu' | 'gpu' | 'cloud';

/** Optional minimum-requirement hints surfaced in the UI's badge tooltip. */
export interface TTSHardwareRequirements {
  /** Minimum total VRAM needed in MB (GPU providers only). */
  minVramMb?: number;
  /** Whether the provider needs CUDA / Metal / ROCm (GPU providers only). */
  needsGpuRuntime?: boolean;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  /** True if synthesis happens on the user's machine (no network leaves the box) */
  readonly isLocal: boolean;
  /** Which class of hardware this provider is built for */
  readonly hardwareClass: TTSHardwareClass;
  /** Optional minimum requirements — used by UI gating + recommendation */
  readonly requirements?: TTSHardwareRequirements;

  /** Synthesize text → audio buffer (WAV/MP3, depends on provider). */
  synth(text: string, options?: TTSOptions): Promise<TTSSynthResult>;

  /** Lightweight reachability check — does the backend respond? */
  testConnection(): Promise<boolean>;

  /** List voices the backend currently exposes. */
  getVoices(): Promise<TTSVoice[]>;
}

export interface TTSSynthResult {
  /** Raw audio bytes — typically a complete WAV or MP3 file payload. */
  audio: ArrayBuffer;
  /** MIME type of `audio` so the renderer can decode it correctly. */
  mediaType: string;
}
