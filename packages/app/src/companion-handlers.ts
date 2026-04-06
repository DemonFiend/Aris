import { ipcMain } from 'electron';
import type { CompanionConfig } from '@aris/shared';
import { DEFAULT_COMPANION_CONFIG } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

const COMPANION_CONFIG_KEY = 'companion-config';

function getCompanionConfig(): CompanionConfig {
  const raw = getSetting(COMPANION_CONFIG_KEY);
  if (!raw) return { ...DEFAULT_COMPANION_CONFIG };
  try {
    const saved = JSON.parse(raw) as Partial<CompanionConfig>;
    // Merge with defaults so new fields always have values
    return {
      ...DEFAULT_COMPANION_CONFIG,
      ...saved,
      personality: { ...DEFAULT_COMPANION_CONFIG.personality, ...saved.personality },
      idle: { ...DEFAULT_COMPANION_CONFIG.idle, ...saved.idle },
    };
  } catch {
    return { ...DEFAULT_COMPANION_CONFIG };
  }
}

export function registerCompanionHandlers(): void {
  ipcMain.handle('companion:get-config', async () => {
    return getCompanionConfig();
  });

  ipcMain.handle('companion:set-config', async (_event, config: Partial<CompanionConfig>) => {
    const current = getCompanionConfig();
    const merged: CompanionConfig = {
      ...current,
      ...config,
      personality: { ...current.personality, ...(config.personality ?? {}) },
      idle: { ...current.idle, ...(config.idle ?? {}) },
    };
    setSetting(COMPANION_CONFIG_KEY, JSON.stringify(merged));
    return merged;
  });
}
