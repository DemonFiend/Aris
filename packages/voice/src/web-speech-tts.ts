import type { TTSEngine, TTSOptions, TTSVoice } from './types';

/**
 * TTS engine using the Web Speech Synthesis API.
 * Runs locally in Chromium with built-in system voices.
 * Must be instantiated in the renderer process.
 */
export class WebSpeechTTS implements TTSEngine {
  readonly id = 'web-speech';
  readonly name = 'Web Speech Synthesis';
  readonly isLocal = true;

  onStart: (() => void) | null = null;
  onEnd: (() => void) | null = null;
  onError: ((error: string) => void) | null = null;

  private synth: SpeechSynthesis;
  private speaking = false;

  constructor() {
    this.synth = globalThis.speechSynthesis;
  }

  speak(text: string, options?: TTSOptions): void {
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);

    if (options?.voice) {
      const voice = this.synth.getVoices().find((v) => v.name === options.voice);
      if (voice) utterance.voice = voice;
    }

    utterance.rate = options?.rate ?? 1.0;
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.volume = options?.volume ?? 1.0;

    utterance.onstart = () => {
      this.speaking = true;
      this.onStart?.();
    };

    utterance.onend = () => {
      this.speaking = false;
      this.onEnd?.();
    };

    utterance.onerror = (event) => {
      this.speaking = false;
      if (event.error !== 'canceled') {
        this.onError?.(event.error);
      }
    };

    this.synth.speak(utterance);
  }

  stop(): void {
    this.synth.cancel();
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  getVoices(): TTSVoice[] {
    return this.synth.getVoices().map((v) => ({
      id: v.name,
      name: v.name,
      language: v.lang,
      isLocal: v.localService,
    }));
  }
}
