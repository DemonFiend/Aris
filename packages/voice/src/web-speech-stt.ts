import type { STTEngine } from './types';

/**
 * STT engine using the Web Speech API (SpeechRecognition).
 * Runs locally in Chromium — no internet required for many languages.
 * Must be instantiated in the renderer process.
 */
export class WebSpeechSTT implements STTEngine {
  readonly id = 'web-speech';
  readonly name = 'Web Speech API';
  readonly isLocal = true;

  onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  private recognition: SpeechRecognition | null = null;
  private listening = false;

  start(language: string): void {
    if (this.listening) return;

    const SpeechRecognition =
      (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.onError?.('SpeechRecognition API not available');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        this.onResult?.(result[0].transcript, result.isFinal);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted') {
        this.onError?.(event.error);
      }
    };

    rec.onend = () => {
      // Auto-restart if still supposed to be listening
      if (this.listening && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          this.listening = false;
        }
      }
    };

    this.recognition = rec;
    rec.start();
    this.listening = true;
  }

  stop(): void {
    this.listening = false;
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  isListening(): boolean {
    return this.listening;
  }
}
