import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import type { VoiceConfig } from '@aris/shared';
import { TTSRegistry, KokoroProvider } from '@aris/voice';
import type { TTSOptions } from '@aris/voice';
import { getSetting, setSetting, deleteSetting } from './settings-store';
import { detectService } from './service-detector';
import { getGpuRuntime } from './hardware-detect';

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  sttEngine: 'web-speech',
  ttsEngine: 'web-speech',
  language: 'en-US',
  pushToTalk: false,
  pushToTalkKey: 'F2',
  vadEnabled: true,
  vadThreshold: 0.02,
  ttsRate: 1.0,
  ttsPitch: 1.0,
};

let pushToTalkRegistered = false;
const ttsRegistry = new TTSRegistry();

function getVoiceConfig(): VoiceConfig {
  const stored = getSetting('voice-config');
  if (stored) {
    return { ...DEFAULT_VOICE_CONFIG, ...JSON.parse(stored) };
  }
  return DEFAULT_VOICE_CONFIG;
}

function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

function registerPushToTalkShortcut(key: string): void {
  unregisterPushToTalkShortcut();

  try {
    globalShortcut.register(key, () => {
      broadcastToRenderers('voice:push-to-talk', true);
    });
    pushToTalkRegistered = true;
  } catch {
    // Key may not be registrable on this platform
  }
}

function unregisterPushToTalkShortcut(): void {
  if (pushToTalkRegistered) {
    globalShortcut.unregisterAll();
    pushToTalkRegistered = false;
  }
}

/**
 * Initialise TTS providers based on detected/configured services. Run once
 * during main-process startup before handlers are wired so the registry is
 * populated before any IPC call lands.
 */
export async function initTTSProviders(): Promise<void> {
  // Kokoro: auto-register if a local FastAPI server is reachable on a known port.
  try {
    const kokoro = await detectService('kokoro');
    if (kokoro.running && kokoro.endpoint) {
      ttsRegistry.register(new KokoroProvider(kokoro.endpoint));
    }
  } catch (err) {
    console.warn(`[initTTSProviders] Kokoro detection failed: ${err instanceof Error ? err.message : err}`);
  }

  // Restore the active provider from persistent settings.
  const savedActiveId = getSetting('activeTTSProviderId');
  if (savedActiveId && ttsRegistry.get(savedActiveId)) {
    ttsRegistry.setActive(savedActiveId);
  }
}

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:get-config', async () => {
    return getVoiceConfig();
  });

  ipcMain.handle('voice:set-config', async (_event, config: Partial<VoiceConfig>) => {
    const current = getVoiceConfig();
    const updated = { ...current, ...config };
    setSetting('voice-config', JSON.stringify(updated));

    // Update push-to-talk shortcut if changed
    if (updated.pushToTalk) {
      registerPushToTalkShortcut(updated.pushToTalkKey);
    } else {
      unregisterPushToTalkShortcut();
    }

    return updated;
  });

  ipcMain.handle('voice:get-status', async () => {
    // Status is primarily tracked in the renderer since engines run there
    // This returns the config-level status
    const config = getVoiceConfig();
    return {
      listening: false, // Renderer tracks actual state
      speaking: false,
      sttEngine: config.sttEngine,
      ttsEngine: config.ttsEngine,
    };
  });

  // These handlers signal the renderer to start/stop listening
  // The actual Web Speech API runs in the renderer process
  ipcMain.handle('voice:start-listening', async () => {
    broadcastToRenderers('voice:command', 'start-listening');
    return true;
  });

  ipcMain.handle('voice:stop-listening', async () => {
    broadcastToRenderers('voice:command', 'stop-listening');
    return true;
  });

  ipcMain.handle('voice:speak', async (_event, text: string) => {
    broadcastToRenderers('voice:command', 'speak', text);
    return true;
  });

  ipcMain.handle('voice:stop-speaking', async () => {
    broadcastToRenderers('voice:command', 'stop-speaking');
    return true;
  });

  ipcMain.handle('voice:get-voices', async () => {
    // Voices are enumerated in the renderer; this triggers enumeration
    broadcastToRenderers('voice:command', 'get-voices');
    return [];
  });

  // -------------------------------------------------------------------------
  // TTS provider registry — mirrors the AI provider registry surface.
  // -------------------------------------------------------------------------

  ipcMain.handle('tts:list-providers', async () => {
    return ttsRegistry.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      isLocal: p.isLocal,
      hardwareClass: p.hardwareClass,
      requirements: p.requirements ?? null,
    }));
  });

  ipcMain.handle('tts:get-active-provider', async () => {
    return ttsRegistry.getActiveId();
  });

  ipcMain.handle('tts:set-provider', async (_event, providerId: string) => {
    ttsRegistry.setActive(providerId);
    setSetting('activeTTSProviderId', providerId);
    return true;
  });

  ipcMain.handle('tts:clear-provider', async () => {
    ttsRegistry.clearActive();
    deleteSetting('activeTTSProviderId');
    return true;
  });

  ipcMain.handle('tts:test-connection', async (_event, providerId?: string) => {
    const provider = providerId ? ttsRegistry.get(providerId) : ttsRegistry.getActive();
    if (!provider) throw new Error(`TTS provider "${providerId}" not found`);
    return provider.testConnection();
  });

  ipcMain.handle('tts:get-voices', async (_event, providerId?: string) => {
    const provider = providerId ? ttsRegistry.get(providerId) : ttsRegistry.getActive();
    if (!provider) throw new Error(`TTS provider "${providerId}" not found`);
    return provider.getVoices();
  });

  /**
   * Synthesize via the active TTS provider and return the audio bytes to the
   * renderer for playback. If no provider is active, callers should fall back
   * to the existing voice:speak broadcast (which drives Web Speech).
   */
  ipcMain.handle('tts:synth', async (_event, text: string, options?: TTSOptions) => {
    const provider = ttsRegistry.getActive();
    const result = await provider.synth(text, options);
    return {
      audio: Buffer.from(result.audio),
      mediaType: result.mediaType,
    };
  });

  // -------------------------------------------------------------------------
  // Hardware probe — used by the TTS settings UI to recommend a default
  // provider and gate the GPU-class Activate button when no GPU is present.
  // -------------------------------------------------------------------------

  ipcMain.handle('hardware:gpu-runtime', async () => {
    return getGpuRuntime();
  });

  // Initialize push-to-talk if configured
  const config = getVoiceConfig();
  if (config.pushToTalk) {
    registerPushToTalkShortcut(config.pushToTalkKey);
  }
}
