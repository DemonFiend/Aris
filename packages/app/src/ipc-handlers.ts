import { ipcMain } from 'electron';
import {
  ProviderRegistry,
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
} from '@aris/ai-core';
import type { ChatMessage, ChatOptions, ProviderConfig } from '@aris/shared';
import { loadProviderConfigs, saveProviderConfig } from './key-store';
import { getSetting, setSetting, deleteSetting, getAllSettings } from './settings-store';
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  searchConversations,
  listMessages,
  addMessage,
} from './conversation-store';
import {
  listGameProfiles,
  getGameProfile,
  createGameProfile,
  updateGameProfile,
  deleteGameProfile,
} from './game-profile-store';
import { exportAllData, wipeAllData } from './data-export';
import {
  getSources,
  startCapture,
  stopCapture,
  getStatus,
  getLatestFrame,
} from './capture-service';
import type { CaptureConfig } from '@aris/shared';

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

  // Settings handlers
  ipcMain.handle('settings:get', async (_event, key: string) => {
    return getSetting(key) ?? null;
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    setSetting(key, value);
    return true;
  });

  ipcMain.handle('settings:delete', async (_event, key: string) => {
    return deleteSetting(key);
  });

  ipcMain.handle('settings:get-all', async () => {
    return getAllSettings();
  });

  // Conversation handlers
  ipcMain.handle('conversations:list', async (_event, limit?: number, offset?: number) => {
    return listConversations(limit, offset);
  });

  ipcMain.handle('conversations:get', async (_event, id: string) => {
    return getConversation(id) ?? null;
  });

  ipcMain.handle(
    'conversations:create',
    async (_event, title: string, gameProfileId?: string) => {
      return createConversation(title, gameProfileId);
    },
  );

  ipcMain.handle('conversations:delete', async (_event, id: string) => {
    return deleteConversation(id);
  });

  ipcMain.handle('conversations:search', async (_event, query: string, limit?: number) => {
    return searchConversations(query, limit);
  });

  // Message handlers
  ipcMain.handle('messages:list', async (_event, conversationId: string) => {
    return listMessages(conversationId);
  });

  ipcMain.handle(
    'messages:add',
    async (
      _event,
      conversationId: string,
      role: 'system' | 'user' | 'assistant',
      content: string,
      model?: string,
      tokenCount?: number,
    ) => {
      return addMessage(conversationId, role, content, model, tokenCount);
    },
  );

  // Game profile handlers
  ipcMain.handle('game-profiles:list', async () => {
    return listGameProfiles();
  });

  ipcMain.handle('game-profiles:get', async (_event, id: string) => {
    return getGameProfile(id) ?? null;
  });

  ipcMain.handle(
    'game-profiles:create',
    async (
      _event,
      name: string,
      opts?: { executablePath?: string; systemPrompt?: string; captureEnabled?: boolean },
    ) => {
      return createGameProfile(name, opts);
    },
  );

  ipcMain.handle(
    'game-profiles:update',
    async (
      _event,
      id: string,
      updates: Partial<{
        name: string;
        executablePath: string;
        systemPrompt: string;
        captureEnabled: boolean;
      }>,
    ) => {
      return updateGameProfile(id, updates) ?? null;
    },
  );

  ipcMain.handle('game-profiles:delete', async (_event, id: string) => {
    return deleteGameProfile(id);
  });

  // Data management handlers
  ipcMain.handle('data:export', async () => {
    return exportAllData();
  });

  ipcMain.handle('data:wipe', async () => {
    wipeAllData();
    return true;
  });

  // Vision capture handlers
  ipcMain.handle('vision:get-sources', async () => {
    return getSources();
  });

  ipcMain.handle(
    'vision:start-capture',
    async (_event, config: Partial<CaptureConfig> & { sourceId: string }) => {
      startCapture(config);
      return getStatus();
    },
  );

  ipcMain.handle('vision:stop-capture', async () => {
    stopCapture();
    return getStatus();
  });

  ipcMain.handle('vision:get-status', async () => {
    return getStatus();
  });

  ipcMain.handle('vision:analyze-frame', async (_event, prompt: string, options?: ChatOptions) => {
    const frame = getLatestFrame();
    if (!frame) throw new Error('No captured frame available');
    const provider = registry.getActive();
    return provider.vision(frame, prompt, options);
  });
}

export { registry };
