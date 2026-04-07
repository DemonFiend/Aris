import { ipcMain, Notification } from 'electron';
import {
  ProviderRegistry,
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
  CustomOpenAIProvider,
  CustomAnthropicProvider,
  LMStudioProvider,
} from '@aris/ai-core';
import type { ChatMessage, ChatOptions, ProviderConfig } from '@aris/shared';
import { loadProviderConfigs, saveProviderConfig, isEncryptionAvailable } from './key-store';
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
import { exportAllData, exportEncryptedFile, importEncryptedFile, wipeAllData } from './data-export';
import {
  getPasswordConfig,
  setPassword,
  setStartupPassword,
  verifyPassword,
  setPasswordConfig,
  removePassword,
} from './password-store';
import {
  getSources,
  startCapture,
  stopCapture,
  getStatus,
  getLatestFrame,
  startHeartbeat,
} from './capture-service';
import {
  loadCaptureSettings,
  saveCaptureSettings,
  getScreenshotFolderStats,
  pruneScreenshots,
  openScreenshotFolder,
  startPruneSchedule,
} from './screenshot-store';
import type { CaptureConfig, CaptureSettings } from '@aris/shared';

const registry = new ProviderRegistry();

const VALID_ROLES = new Set(['system', 'user', 'assistant']);

/** Track whether we've already sent a capture notification this session */
let captureNotifiedThisSession = false;

function notifyCaptureStarted(): void {
  if (captureNotifiedThisSession) return;
  captureNotifiedThisSession = true;
  if (Notification.isSupported()) {
    new Notification({
      title: 'Aris — Screen Capture Active',
      body: 'Screen capture is now running. Your screen content is being captured and stored locally.',
    }).show();
  }
}

function validateMessages(messages: unknown): asserts messages is ChatMessage[] {
  if (!Array.isArray(messages)) throw new Error('messages must be an array');
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') throw new Error('Each message must be an object');
    if (typeof msg.content !== 'string') throw new Error('Message content must be a string');
    if (!VALID_ROLES.has(msg.role)) throw new Error(`Invalid message role: ${msg.role}`);
  }
}

function validateString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function validateProviderUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid provider URL: ${url}`);
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);

  if (!isLocalhost && parsed.protocol !== 'https:') {
    throw new Error('Custom provider URL must use HTTPS');
  }

  // Block RFC 1918 private ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) {
    throw new Error('Custom provider URL must not target private network addresses');
  }
}

function initProviderFromConfig(config: ProviderConfig): void {
  if (!config.enabled) return;

  registry.unregister(config.id);

  switch (config.id) {
    case 'claude':
      if (config.apiKey) {
        registry.register(new ClaudeProvider(config.apiKey, config.defaultModel));
      }
      break;
    case 'openai':
      if (config.apiKey) {
        registry.register(new OpenAIProvider(config.apiKey, config.defaultModel));
      }
      break;
    case 'ollama':
      if (config.baseUrl) validateProviderUrl(config.baseUrl);
      registry.register(new OllamaProvider(config.baseUrl, config.defaultModel));
      break;
    case 'custom-openai':
      if (config.baseUrl) {
        validateProviderUrl(config.baseUrl);
        registry.register(new CustomOpenAIProvider(config.baseUrl, config.apiKey, config.defaultModel));
      }
      break;
    case 'custom-anthropic':
      if (config.baseUrl) {
        validateProviderUrl(config.baseUrl);
        registry.register(new CustomAnthropicProvider(config.baseUrl, config.apiKey, config.defaultModel));
      }
      break;
    case 'lmstudio':
      if (config.baseUrl) validateProviderUrl(config.baseUrl);
      registry.register(new LMStudioProvider(config.baseUrl, config.defaultModel));
      break;
  }
}

export function initProviders(): void {
  const configs = loadProviderConfigs();
  for (const config of configs) {
    try {
      initProviderFromConfig(config);
    } catch (err) {
      console.warn(`[initProviders] Skipping provider "${config.id}": ${err instanceof Error ? err.message : err}`);
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('ai:chat', async (_event, messages: ChatMessage[], options?: ChatOptions) => {
    validateMessages(messages);
    const provider = registry.getActive();
    return provider.chat(messages, options);
  });

  ipcMain.handle(
    'ai:stream-chat',
    async (event, messages: ChatMessage[], options?: ChatOptions) => {
      validateMessages(messages);
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
      validateString(imageBase64, 'imageBase64');
      validateString(prompt, 'prompt');
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
    if (!config || typeof config.id !== 'string') {
      throw new Error('Invalid provider config: id is required');
    }
    if (config.baseUrl) {
      validateProviderUrl(config.baseUrl);
    }
    try {
      saveProviderConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save provider config';
      throw new Error(message);
    }
    initProviderFromConfig(config);
    return { saved: true, encryptionAvailable: isEncryptionAvailable() };
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
      validateString(conversationId, 'conversationId');
      if (!VALID_ROLES.has(role)) throw new Error(`Invalid role: ${role}`);
      if (typeof content !== 'string') throw new Error('content must be a string');
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

  ipcMain.handle('data:export-encrypted', async () => {
    return exportEncryptedFile();
  });

  ipcMain.handle('data:import-encrypted', async () => {
    return importEncryptedFile();
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
      const settings = loadCaptureSettings();
      if (!settings.screenCaptureConsented) {
        throw new Error('Screen capture requires user consent. Please acknowledge the privacy notice before enabling capture.');
      }
      startCapture(config);
      notifyCaptureStarted();
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

  // Capture settings handlers
  ipcMain.handle('vision:get-capture-settings', async () => {
    return loadCaptureSettings();
  });

  ipcMain.handle('vision:set-capture-settings', async (_event, settings: CaptureSettings) => {
    saveCaptureSettings(settings);
    // Restart heartbeat if settings changed and consent was given
    if (settings.heartbeatEnabled && settings.screenCaptureConsented) {
      startHeartbeat();
      notifyCaptureStarted();
    }
    return true;
  });

  ipcMain.handle('vision:get-screenshot-stats', async () => {
    return getScreenshotFolderStats();
  });

  ipcMain.handle('vision:prune-screenshots', async () => {
    return pruneScreenshots();
  });

  ipcMain.handle('vision:open-screenshot-folder', async () => {
    openScreenshotFolder();
    return true;
  });

  ipcMain.handle('vision:pick-screenshot-folder', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Screenshot Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Capture consent handlers
  ipcMain.handle('vision:get-capture-consent', async () => {
    const settings = loadCaptureSettings();
    return settings.screenCaptureConsented;
  });

  ipcMain.handle('vision:set-capture-consent', async (_event, consented: boolean) => {
    const settings = loadCaptureSettings();
    settings.screenCaptureConsented = consented;
    saveCaptureSettings(settings);
    return true;
  });

  // Password lock handlers
  ipcMain.handle('password:get-config', async () => {
    return getPasswordConfig();
  });

  ipcMain.handle('password:set-password', async (_event, password: string) => {
    validateString(password, 'password');
    await setPassword(password);
    return getPasswordConfig();
  });

  ipcMain.handle('password:set-startup-password', async (_event, password: string) => {
    validateString(password, 'password');
    await setStartupPassword(password);
    return getPasswordConfig();
  });

  ipcMain.handle(
    'password:verify',
    async (_event, password: string, purpose: 'enable' | 'startup') => {
      validateString(password, 'password');
      if (purpose !== 'enable' && purpose !== 'startup') {
        throw new Error('purpose must be "enable" or "startup"');
      }
      return verifyPassword(password, purpose);
    },
  );

  ipcMain.handle('password:set-config', async (_event, updates: Record<string, unknown>) => {
    const safe: Record<string, boolean> = {};
    for (const key of ['enabled', 'onEnable', 'onStart', 'useSamePassword'] as const) {
      if (typeof updates[key] === 'boolean') {
        safe[key] = updates[key] as boolean;
      }
    }
    setPasswordConfig(safe);
    return getPasswordConfig();
  });

  ipcMain.handle('password:remove', async () => {
    removePassword();
    return getPasswordConfig();
  });

  // Initialize prune schedule and heartbeat on startup
  startPruneSchedule();
  const captureSettings = loadCaptureSettings();
  if (captureSettings.heartbeatEnabled && captureSettings.screenCaptureConsented) {
    startHeartbeat();
  }
}

export { registry };
