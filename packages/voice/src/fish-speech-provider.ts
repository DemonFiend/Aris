import type { TTSOptions, TTSProvider, TTSSynthResult, TTSVoice } from './types';

/**
 * TTS provider talking to a self-hosted Fish Speech api_server
 * (https://github.com/fishaudio/fish-speech). Defaults match the upstream
 * `python -m tools.api_server --listen 127.0.0.1:8080` invocation.
 *
 * The server's /v1/tts endpoint accepts JSON and returns raw audio bytes
 * in the requested format (wav/mp3). Voice selection happens via
 * `reference_id` for catalog voices or `reference_audio` + `reference_text`
 * for zero-shot cloning (ARI-o0r will surface the cloning flow).
 */
export class FishSpeechProvider implements TTSProvider {
  readonly id = 'fish-speech';
  readonly name = 'Fish Speech';
  readonly isLocal = true;
  readonly hardwareClass = 'gpu' as const;
  readonly requirements = { minVramMb: 6144, needsGpuRuntime: true };

  private baseUrl: string;
  private defaultVoice: string | null;

  constructor(baseUrl = 'http://127.0.0.1:8080', defaultVoice: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultVoice = defaultVoice;
  }

  async synth(text: string, options?: TTSOptions): Promise<TTSSynthResult> {
    const referenceId = options?.voice ?? this.defaultVoice;
    const body: Record<string, unknown> = {
      text,
      format: 'wav',
      chunk_length: 200,
      max_new_tokens: 1024,
    };
    if (referenceId) body.reference_id = referenceId;

    const res = await fetch(`${this.baseUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`Fish Speech error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const audio = await res.arrayBuffer();
    return { audio, mediaType: 'audio/wav' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/health`);
      if (res.ok) return true;
    } catch {
      // Older builds don't expose /v1/health — fall through to a tiny synth probe
    }
    try {
      const res = await fetch(`${this.baseUrl}/`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getVoices(): Promise<TTSVoice[]> {
    // Fish Speech doesn't ship a catalog endpoint; user-named cloned voices
    // are managed externally. Voice cloning UX (ARI-o0r) will populate this
    // from a local catalog stored alongside the reference samples.
    return [];
  }
}
