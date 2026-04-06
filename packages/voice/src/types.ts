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

/** TTS engine interface — all text-to-speech backends must implement this */
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
