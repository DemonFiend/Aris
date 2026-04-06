import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AvatarInfo } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

const AVATAR_DIR_NAME = 'avatars';
const DEFAULT_AVATAR_KEY = 'avatar-default';

function getAvatarDirectory(): string {
  return path.join(app.getPath('userData'), AVATAR_DIR_NAME);
}

function ensureAvatarDirectory(): string {
  const dir = getAvatarDirectory();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function listAvatarFiles(): AvatarInfo[] {
  const dir = ensureAvatarDirectory();

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
  const fullPath = path.join(ensureAvatarDirectory(), defaultFile);
  return fs.existsSync(fullPath) ? fullPath : null;
}

export function registerAvatarHandlers(): void {
  ipcMain.handle('avatar:list-available', async () => {
    return listAvatarFiles();
  });

  ipcMain.handle('avatar:get-default', async () => {
    const defaultFile = getSetting(DEFAULT_AVATAR_KEY);
    if (!defaultFile) return null;
    const fullPath = path.join(ensureAvatarDirectory(), defaultFile);
    if (!fs.existsSync(fullPath)) return null;
    return { filename: defaultFile, path: fullPath };
  });

  ipcMain.handle('avatar:set-default', async (_event, filename: string) => {
    const fullPath = path.join(ensureAvatarDirectory(), filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Avatar file not found: ${filename}`);
    }
    setSetting(DEFAULT_AVATAR_KEY, filename);
    return true;
  });

  ipcMain.handle('avatar:open-folder', async () => {
    const dir = ensureAvatarDirectory();
    const errMsg = await shell.openPath(dir);
    if (errMsg) throw new Error(`Could not open folder: ${errMsg}`);
    return dir;
  });

  ipcMain.handle('avatar:delete', async (_event, filename: string) => {
    const dir = ensureAvatarDirectory();
    const fullPath = path.join(dir, filename);
    // Security: ensure the resolved path is inside the avatar directory
    if (!fullPath.startsWith(dir)) {
      throw new Error('Invalid avatar filename');
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Avatar file not found: ${filename}`);
    }
    fs.unlinkSync(fullPath);
    // If this was the default, clear the default setting
    const currentDefault = getSetting(DEFAULT_AVATAR_KEY);
    if (currentDefault === filename) {
      setSetting(DEFAULT_AVATAR_KEY, '');
    }
    return true;
  });

  ipcMain.handle('avatar:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.OpenDialogOptions = {
      title: 'Import VRM Avatar',
      filters: [{ name: 'VRM Models', extensions: ['vrm'] }],
      properties: ['openFile', 'multiSelections'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return [];

    const dir = ensureAvatarDirectory();
    const imported: string[] = [];
    for (const src of result.filePaths) {
      const filename = path.basename(src);
      const dest = path.join(dir, filename);
      fs.copyFileSync(src, dest);
      imported.push(filename);
    }
    return imported;
  });
}
