import type { TTSOptions, TTSProvider, TTSSynthResult, TTSVoice } from './types';

interface KokoroVoicesResponse {
  voices?: string[];
}

/**
 * TTS provider talking to a local Kokoro-FastAPI server
 * (https://github.com/remsky/Kokoro-FastAPI). OpenAI-compatible HTTP API.
 */
export class KokoroProvider implements TTSProvider {
  readonly id = 'kokoro';
  readonly name = 'Kokoro TTS';
  readonly isLocal = true;

  private baseUrl: string;
  private defaultVoice: string;

  constructor(baseUrl = 'http://127.0.0.1:8880', defaultVoice = 'af_bella') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultVoice = defaultVoice;
  }

  async synth(text: string, options?: TTSOptions): Promise<TTSSynthResult> {
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: options?.voice ?? this.defaultVoice,
        response_format: 'mp3',
        speed: options?.rate ?? 1.0,
      }),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`Kokoro error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const audio = await res.arrayBuffer();
    return { audio, mediaType: 'audio/mpeg' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/voices`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getVoices(): Promise<TTSVoice[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/voices`);
      if (!res.ok) return [];
      const data = (await res.json()) as KokoroVoicesResponse;
      const ids = Array.isArray(data.voices) ? data.voices : [];
      return ids.map((id) => ({
        id,
        name: id,
        language: id.startsWith('af_') || id.startsWith('am_') ? 'en-US' : 'en',
        isLocal: true,
      }));
    } catch {
      return [];
    }
  }
}
