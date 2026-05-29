import type { TTSOptions, TTSProvider, TTSSynthResult, TTSVoice } from './types';

/**
 * TTS provider talking to a self-hosted Sesame CSM (Conversational Speech
 * Model) wrapper (https://github.com/SesameAILabs/csm). Apache 2.0; the
 * 1B base model open release. Purpose-built for AI companions — the standout
 * is emotional inflection and natural conversational pacing, which pairs
 * with Aris's avatar expression/lip-sync system.
 *
 * Sesame doesn't ship a canonical HTTP server; this provider targets the
 * common community FastAPI wrapper convention (POST /synthesize, JSON body
 * with `text` and optional `reference_audio` for cloning). The default port
 * matches the standard FastAPI default.
 *
 * Hardware: heavier than F5-TTS (~6-8 GB VRAM). PyTorch backend means it
 * works on CUDA / ROCm / DirectML / Metal, though some torchao quantization
 * paths may need patching on DirectML — note in the install steps.
 */
export class SesameCSMProvider implements TTSProvider {
  readonly id = 'sesame-csm';
  readonly name = 'Sesame CSM';
  readonly isLocal = true;
  readonly hardwareClass = 'gpu' as const;
  readonly requirements = { minVramMb: 8192, needsGpuRuntime: true };

  private baseUrl: string;
  private defaultVoice: string | null;

  constructor(baseUrl = 'http://127.0.0.1:8000', defaultVoice: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultVoice = defaultVoice;
  }

  async synth(text: string, options?: TTSOptions): Promise<TTSSynthResult> {
    const voice = options?.voice ?? this.defaultVoice;
    const body: Record<string, unknown> = {
      text,
      format: 'wav',
      speed: options?.rate ?? 1.0,
    };
    if (voice) body.speaker = voice;

    const res = await fetch(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`Sesame CSM error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const audio = await res.arrayBuffer();
    return { audio, mediaType: 'audio/wav' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (res.ok) return true;
    } catch { /* fall through */ }
    try {
      const res = await fetch(`${this.baseUrl}/`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getVoices(): Promise<TTSVoice[]> {
    try {
      const res = await fetch(`${this.baseUrl}/voices`);
      if (!res.ok) return [];
      const data = (await res.json()) as { voices?: string[] };
      const ids = Array.isArray(data.voices) ? data.voices : [];
      return ids.map((id) => ({ id, name: id, language: 'en', isLocal: true }));
    } catch {
      return [];
    }
  }
}
