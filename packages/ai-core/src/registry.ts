import type { AIProvider } from '@aris/shared';

/**
 * Central registry for AI providers. Players select their active provider;
 * the registry resolves it and routes all AI calls through the interface.
 */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private activeId: string | null = null;

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider "${id}" is not registered`);
    }
    this.activeId = id;
  }

  getActive(): AIProvider {
    if (!this.activeId) {
      throw new Error('No active AI provider set');
    }
    const provider = this.providers.get(this.activeId);
    if (!provider) {
      throw new Error(`Active provider "${this.activeId}" not found`);
    }
    return provider;
  }

  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }
}
