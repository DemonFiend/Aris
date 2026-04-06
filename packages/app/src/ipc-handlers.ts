import { ipcMain } from 'electron';
import {
  ProviderRegistry,
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
} from '@aris/ai-core';
import type { ChatMessage, ChatOptions, ProviderConfig } from '@aris/shared';
import { loadProviderConfigs, saveProviderConfig } from './key-store';

const registry = new ProviderRegistry();

function initProviderFromConfig(config: ProviderConfig): void {
  if (!config.enabled) return;

  registry.unregister(config.id);

  switch (config.id) {
    case 'claude':
      if (config.apiKey) {
        registry.register(new ClaudeProvider(config.apiKey));
      }
      break;
    case 'openai':
      if (config.apiKey) {
        registry.register(new OpenAIProvider(config.apiKey));
      }
      break;
    case 'ollama':
      registry.register(new OllamaProvider(config.baseUrl));
      break;
  }
}

export function initProviders(): void {
  const configs = loadProviderConfigs();
  for (const config of configs) {
    initProviderFromConfig(config);
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('ai:chat', async (_event, messages: ChatMessage[], options?: ChatOptions) => {
    const provider = registry.getActive();
    return provider.chat(messages, options);
  });

  ipcMain.handle(
    'ai:stream-chat',
    async (event, messages: ChatMessage[], options?: ChatOptions) => {
      const provider = registry.getActive();
      const sender = event.sender;
      for await (const chunk of provider.streamChat(messages, options)) {
        sender.send('ai:stream-chunk', chunk);
      }
    },
  );

  ipcMain.handle(
    'ai:vision',
    async (_event, imageBase64: string, prompt: string, options?: ChatOptions) => {
      const provider = registry.getActive();
      const image = Buffer.from(imageBase64, 'base64');
      return provider.vision(image, prompt, options);
    },
  );

  ipcMain.handle('ai:get-providers', async () => {
    return registry.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      supportsVision: p.supportsVision,
      supportsStreaming: p.supportsStreaming,
    }));
  });

  ipcMain.handle('ai:set-provider', async (_event, providerId: string) => {
    registry.setActive(providerId);
    return true;
  });

  ipcMain.handle('ai:test-connection', async (_event, providerId?: string) => {
    const provider = providerId ? registry.get(providerId) : registry.getActive();
    if (!provider) throw new Error(`Provider "${providerId}" not found`);
    return provider.testConnection();
  });

  ipcMain.handle('ai:get-models', async (_event, providerId?: string) => {
    const provider = providerId ? registry.get(providerId) : registry.getActive();
    if (!provider) throw new Error(`Provider "${providerId}" not found`);
    return provider.getModels();
  });

  ipcMain.handle('ai:get-provider-configs', async () => {
    const configs = loadProviderConfigs();
    return configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? '••••••••' : undefined,
    }));
  });

  ipcMain.handle('ai:save-provider-config', async (_event, config: ProviderConfig) => {
    saveProviderConfig(config);
    initProviderFromConfig(config);
    return true;
  });
}

export { registry };
