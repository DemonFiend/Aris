import type { TTSProvider } from './types';

/**
 * Central registry for server-side TTS providers (Kokoro, Fish Speech, ...).
 *
 * Mirrors @aris/ai-core's ProviderRegistry. The active provider is the one all
 * `tts:speak` IPC calls route through. Renderer-side engines (Web Speech) are
 * not registered here — they live in the renderer and serve as a fallback
 * when no server-side provider is active.
 */
export class TTSRegistry {
  private providers = new Map<string, TTSProvider>();
  private activeId: string | null = null;

  register(provider: TTSProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  /**
   * Atomically swap a provider instance while preserving active state.
   * Use this from save / reconfigure flows instead of `unregister` then
   * `register` — the latter silently drops `activeId`. (See ARI-7zl.)
   */
  replace(provider: TTSProvider): void {
    const wasActive = this.activeId === provider.id;
    this.unregister(provider.id);
    this.register(provider);
    if (wasActive) {
      this.setActive(provider.id);
    }
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`TTS provider "${id}" is not registered`);
    }
    this.activeId = id;
  }

  getActive(): TTSProvider {
    if (!this.activeId) {
      throw new Error('No active TTS provider set');
    }
    const provider = this.providers.get(this.activeId);
    if (!provider) {
      throw new Error(`Active TTS provider "${this.activeId}" not found`);
    }
    return provider;
  }

  getAll(): TTSProvider[] {
    return Array.from(this.providers.values());
  }

  get(id: string): TTSProvider | undefined {
    return this.providers.get(id);
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  clearActive(): void {
    this.activeId = null;
  }
}
