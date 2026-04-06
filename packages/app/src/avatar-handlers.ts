import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AvatarInfo } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

const AVATAR_DIR_NAME = 'avatars';
const DEFAULT_AVATAR_KEY = 'avatar-default';

function getAvatarDirectory(): string {
  return path.join(app.getPath('appData'), 'aris', AVATAR_DIR_NAME);
}

function listAvatarFiles(): AvatarInfo[] {
  const dir = getAvatarDirectory();
  if (!fs.existsSync(dir)) return [];

  const defaultAvatar = getSetting(DEFAULT_AVATAR_KEY);
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.vrm'))
    .map((filename) => ({
      filename,
      name: path.basename(filename, path.extname(filename)),
      isDefault: filename === defaultAvatar,
    }));
}

export function getDefaultAvatarPath(): string | null {
  const defaultFile = getSetting(DEFAULT_AVATAR_KEY);
  if (!defaultFile) return null;
  const fullPath = path.join(getAvatarDirectory(), defaultFile);
  return fs.existsSync(fullPath) ? fullPath : null;
}

export function registerAvatarHandlers(): void {
  ipcMain.handle('avatar:list-available', async () => {
    return listAvatarFiles();
  });

  ipcMain.handle('avatar:get-default', async () => {
    const defaultFile = getSetting(DEFAULT_AVATAR_KEY);
    if (!defaultFile) return null;
    const fullPath = path.join(getAvatarDirectory(), defaultFile);
    if (!fs.existsSync(fullPath)) return null;
    return { filename: defaultFile, path: fullPath };
  });

  ipcMain.handle('avatar:set-default', async (_event, filename: string) => {
    const fullPath = path.join(getAvatarDirectory(), filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Avatar file not found: ${filename}`);
    }
    setSetting(DEFAULT_AVATAR_KEY, filename);
    return true;
  });
}
