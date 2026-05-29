import type { TTSOptions, TTSProvider, TTSSynthResult, TTSVoice } from './types';

/**
 * TTS provider talking to a self-hosted F5-TTS server
 * (https://github.com/SWivid/F5-TTS). F5-TTS itself ships a Gradio demo and
 * an inference CLI; community wrappers (e.g. F5-TTS_Server, F5TTS-API)
 * expose an OpenAI-compatible /v1/audio/speech endpoint that this provider
 * targets. The default port matches the most common community wrapper.
 *
 * Hardware portability: F5-TTS runs on PyTorch — CUDA on NVIDIA, ROCm on
 * AMD/Linux, DirectML on AMD/Windows, MPS on Apple Silicon. This is the
 * primary GPU TTS provider for users without an NVIDIA card.
 */
export class F5TTSProvider implements TTSProvider {
  readonly id = 'f5-tts';
  readonly name = 'F5-TTS';
  readonly isLocal = true;
  readonly hardwareClass = 'gpu' as const;
  readonly requirements = { minVramMb: 4096, needsGpuRuntime: true };

  private baseUrl: string;
  private defaultVoice: string | null;

  constructor(baseUrl = 'http://127.0.0.1:7860', defaultVoice: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultVoice = defaultVoice;
  }

  async synth(text: string, options?: TTSOptions): Promise<TTSSynthResult> {
    const voice = options?.voice ?? this.defaultVoice;
    const body: Record<string, unknown> = {
      model: 'f5-tts',
      input: text,
      response_format: 'wav',
      speed: options?.rate ?? 1.0,
    };
    if (voice) body.voice = voice;

    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`F5-TTS error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const audio = await res.arrayBuffer();
    return { audio, mediaType: 'audio/wav' };
  }

  async testConnection(): Promise<boolean> {
    // OpenAI-compatible wrappers commonly expose /v1/voices for catalog;
    // fall back to the gradio root so older wrappers still register healthy.
    try {
      const res = await fetch(`${this.baseUrl}/v1/voices`);
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
      const res = await fetch(`${this.baseUrl}/v1/voices`);
      if (!res.ok) return [];
      const data = (await res.json()) as { voices?: string[] };
      const ids = Array.isArray(data.voices) ? data.voices : [];
      return ids.map((id) => ({ id, name: id, language: 'en', isLocal: true }));
    } catch {
      return [];
    }
  }
}
