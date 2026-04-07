import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AvatarInfo, AvatarMetadata, VirtualSpaceConfig } from '@aris/shared';
import { DEFAULT_VIRTUAL_SPACE_CONFIG } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

const SPACE_CONFIG_KEY = 'avatar-space-config';

type CameraMode = 'portrait' | 'fullbody';
let currentCameraMode: CameraMode = 'portrait';

function getSpaceConfig(): VirtualSpaceConfig {
  const raw = getSetting(SPACE_CONFIG_KEY);
  if (!raw) return { ...DEFAULT_VIRTUAL_SPACE_CONFIG };
  try {
    const saved = JSON.parse(raw) as Partial<VirtualSpaceConfig>;
    return { ...DEFAULT_VIRTUAL_SPACE_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_VIRTUAL_SPACE_CONFIG };
  }
}

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

/** Resolve a filename inside the avatar directory, rejecting path traversal */
function safeAvatarPath(dir: string, filename: string): string {
  const resolved = path.resolve(dir, filename);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
    throw new Error('Invalid avatar filename');
  }
  return resolved;
}

function getMetaPath(dir: string, vrmFilename: string): string {
  return path.join(dir, vrmFilename.replace(/\.vrm$/i, '.meta.json'));
}

function readMetadata(dir: string, vrmFilename: string): AvatarMetadata | undefined {
  const metaPath = getMetaPath(dir, vrmFilename);
  if (!fs.existsSync(metaPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as AvatarMetadata;
  } catch {
    return undefined;
  }
}

function writeMetadata(dir: string, vrmFilename: string, meta: AvatarMetadata): void {
  const metaPath = getMetaPath(dir, vrmFilename);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function ensureMetadata(dir: string, vrmFilename: string, importedAt?: string): AvatarMetadata {
  const existing = readMetadata(dir, vrmFilename);
  if (existing) return existing;
  const meta: AvatarMetadata = {
    isHumanoid: null,
    humanoidOverride: null,
    hasExpressions: null,
    hasLipSync: null,
    importedAt: importedAt ?? new Date().toISOString(),
  };
  writeMetadata(dir, vrmFilename, meta);
  return meta;
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
      metadata: readMetadata(dir, filename),
    }));
}

const DEFAULT_VRM_FILENAME = 'default-avatar.vrm';

function getBundledVrmPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, DEFAULT_VRM_FILENAME);
  }
  // In dev/test mode __dirname is packages/app/dist, so go up one level to resources
  return path.join(__dirname, '..', 'resources', DEFAULT_VRM_FILENAME);
}

function seedDefaultAvatar(): void {
  const dir = ensureAvatarDirectory();
  const hasVrm = fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith('.vrm'));
  if (hasVrm) return;

  const bundledPath = getBundledVrmPath();
  if (!fs.existsSync(bundledPath)) return;

  const dest = path.join(dir, DEFAULT_VRM_FILENAME);
  fs.copyFileSync(bundledPath, dest);
  ensureMetadata(dir, DEFAULT_VRM_FILENAME);

  // Set as default if none is configured yet
  if (!getSetting(DEFAULT_AVATAR_KEY)) {
    setSetting(DEFAULT_AVATAR_KEY, DEFAULT_VRM_FILENAME);
  }
}

export function getDefaultAvatarPath(): string | null {
  const defaultFile = getSetting(DEFAULT_AVATAR_KEY);
  if (!defaultFile) return null;
  try {
    const fullPath = safeAvatarPath(ensureAvatarDirectory(), defaultFile);
    return fs.existsSync(fullPath) ? fullPath : null;
  } catch {
    return null;
  }
}

export function registerAvatarHandlers(): void {
  seedDefaultAvatar();

  ipcMain.handle('avatar:list-available', async () => {
    return listAvatarFiles();
  });

  ipcMain.handle('avatar:get-default', async () => {
    const defaultFile = getSetting(DEFAULT_AVATAR_KEY);
    if (!defaultFile) return null;
    try {
      const fullPath = safeAvatarPath(ensureAvatarDirectory(), defaultFile);
      if (!fs.existsSync(fullPath)) return null;
      return { filename: defaultFile, path: fullPath };
    } catch {
      return null;
    }
  });

  ipcMain.handle('avatar:set-default', async (_event, filename: string) => {
    const dir = ensureAvatarDirectory();
    const fullPath = safeAvatarPath(dir, filename);
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
    const fullPath = safeAvatarPath(dir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Avatar file not found: ${filename}`);
    }
    fs.unlinkSync(fullPath);
    // Clean up associated metadata file if present
    const metaPath = getMetaPath(dir, filename);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    // If this was the default, clear the default setting
    const currentDefault = getSetting(DEFAULT_AVATAR_KEY);
    if (currentDefault === filename) {
      setSetting(DEFAULT_AVATAR_KEY, '');
    }
    return true;
  });

  ipcMain.handle('avatar:get-space-config', async () => {
    return getSpaceConfig();
  });

  ipcMain.handle('avatar:set-space-config', async (_event, config: Partial<VirtualSpaceConfig>) => {
    const current = getSpaceConfig();
    const merged: VirtualSpaceConfig = { ...current, ...config };
    setSetting(SPACE_CONFIG_KEY, JSON.stringify(merged));
    // Broadcast the updated config to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('avatar:space-config-changed', merged);
      }
    }
    return merged;
  });

  ipcMain.handle('avatar:get-camera-mode', async () => {
    return currentCameraMode;
  });

  ipcMain.handle('avatar:set-camera-mode', async (_event, mode: CameraMode) => {
    if (mode !== 'portrait' && mode !== 'fullbody') {
      throw new Error(`Invalid camera mode: ${mode}`);
    }
    currentCameraMode = mode;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('avatar:camera-mode-changed', mode);
      }
    }
    return mode;
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
    const importedAt = new Date().toISOString();
    for (const src of result.filePaths) {
      const filename = path.basename(src);
      const dest = path.join(dir, filename);
      fs.copyFileSync(src, dest);
      ensureMetadata(dir, filename, importedAt);
      imported.push(filename);
    }
    return imported;
  });

  ipcMain.handle('avatar:update-metadata', async (_event, filename: string, partial: Partial<Pick<AvatarMetadata, 'isHumanoid' | 'hasExpressions' | 'hasLipSync'>>) => {
    const dir = ensureAvatarDirectory();
    safeAvatarPath(dir, filename); // validate filename
    const current = ensureMetadata(dir, filename);
    const updated: AvatarMetadata = { ...current, ...partial };
    writeMetadata(dir, filename, updated);
    return updated;
  });

  ipcMain.handle('avatar:set-humanoid-override', async (_event, filename: string, override: boolean | null) => {
    const dir = ensureAvatarDirectory();
    safeAvatarPath(dir, filename); // validate filename
    const current = ensureMetadata(dir, filename);
    const updated: AvatarMetadata = { ...current, humanoidOverride: override };
    writeMetadata(dir, filename, updated);
    return updated;
  });
}
