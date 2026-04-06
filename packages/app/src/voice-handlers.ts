import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import type { VoiceConfig } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

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

  // Initialize push-to-talk if configured
  const config = getVoiceConfig();
  if (config.pushToTalk) {
    registerPushToTalkShortcut(config.pushToTalkKey);
  }
}
