import { app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import {
  DATA_DIR,
  SCREENSHOTS_SUBFOLDER,
  SCREENSHOTS_MAX_COUNT,
  SCREENSHOTS_PRUNE_INTERVAL_MINUTES,
  SCREENSHOTS_FOLDER_SIZE_LIMIT_MB,
  CAPTURE_FPS_DEFAULT,
  CAPTURE_MAX_WIDTH,
  CAPTURE_MAX_HEIGHT,
  CAPTURE_JPEG_QUALITY,
  HEARTBEAT_ENABLED_DEFAULT,
  HEARTBEAT_INTERVAL_SECONDS,
} from '@aris/shared';
import type { CaptureSettings, ScreenshotFolderStats } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';
import { encryptScreenshot, decryptScreenshot, secureDelete } from './screenshot-crypto';

const SETTINGS_KEY = 'capture-settings';

let pruneTimer: ReturnType<typeof setInterval> | null = null;

function getDefaultScreenshotFolder(): string {
  return path.join(app.getPath('userData'), DATA_DIR, SCREENSHOTS_SUBFOLDER);
}

export function getDefaultCaptureSettings(): CaptureSettings {
  return {
    captureMode: 'monitor',
    fps: CAPTURE_FPS_DEFAULT,
    maxWidth: CAPTURE_MAX_WIDTH,
    maxHeight: CAPTURE_MAX_HEIGHT,
    jpegQuality: CAPTURE_JPEG_QUALITY,
    saveToDisk: true,
    screenshotFolder: getDefaultScreenshotFolder(),
    maxScreenshots: SCREENSHOTS_MAX_COUNT,
    pruneIntervalMinutes: SCREENSHOTS_PRUNE_INTERVAL_MINUTES,
    folderSizeLimitMb: SCREENSHOTS_FOLDER_SIZE_LIMIT_MB,
    heartbeatEnabled: HEARTBEAT_ENABLED_DEFAULT,
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    videoEnabled: false,
    videoMaxDurationSeconds: 300,
    videoFps: 15,
    videoQuality: 'medium',
  };
}

export function loadCaptureSettings(): CaptureSettings {
  const raw = getSetting(SETTINGS_KEY);
  if (!raw) return getDefaultCaptureSettings();
  try {
    const parsed = JSON.parse(raw) as Partial<CaptureSettings>;
    return { ...getDefaultCaptureSettings(), ...parsed };
  } catch {
    return getDefaultCaptureSettings();
  }
}

export function saveCaptureSettings(settings: CaptureSettings): void {
  setSetting(SETTINGS_KEY, JSON.stringify(settings));
  // Restart prune timer if interval changed
  startPruneSchedule(settings);
}

function ensureFolder(folderPath: string): void {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

export function saveScreenshot(
  buffer: Buffer,
  detectedGame?: string,
): string | null {
  const settings = loadCaptureSettings();
  if (!settings.saveToDisk) return null;

  ensureFolder(settings.screenshotFolder);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const gameSuffix = detectedGame ? `_${detectedGame.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
  const filename = `screenshot_${timestamp}${gameSuffix}.enc`;
  const filePath = path.join(settings.screenshotFolder, filename);

  const encrypted = encryptScreenshot(buffer);
  fs.writeFileSync(filePath, encrypted);
  return filePath;
}

/** Decrypt and return a saved screenshot as a JPEG buffer */
export function readScreenshot(filePath: string): Buffer {
  const raw = fs.readFileSync(filePath);
  // Legacy unencrypted JPEG files start with FF D8 (JPEG SOI marker)
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xd8) {
    return raw;
  }
  return decryptScreenshot(raw);
}

export function getScreenshotFolderStats(): ScreenshotFolderStats {
  const settings = loadCaptureSettings();
  const folder = settings.screenshotFolder;

  if (!fs.existsSync(folder)) {
    return { totalFiles: 0, totalSizeMb: 0 };
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.enc') || f.endsWith('.jpg'))
    .map((f) => {
      const fp = path.join(folder, f);
      const stat = fs.statSync(fp);
      return { name: f, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    totalFiles: files.length,
    totalSizeMb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
    oldestFile: files[0]?.name,
    newestFile: files[files.length - 1]?.name,
  };
}

export function pruneScreenshots(): { deleted: number } {
  const settings = loadCaptureSettings();
  const folder = settings.screenshotFolder;

  if (!fs.existsSync(folder)) return { deleted: 0 };

  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.enc') || f.endsWith('.jpg'))
    .map((f) => {
      const fp = path.join(folder, f);
      const stat = fs.statSync(fp);
      return { name: f, path: fp, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime); // oldest first

  let deleted = 0;

  // Enforce max count — delete oldest first
  while (files.length - deleted > settings.maxScreenshots) {
    const file = files[deleted];
    try {
      secureDelete(file.path);
      deleted++;
    } catch {
      break;
    }
  }

  // Enforce folder size limit
  let totalSize = files.slice(deleted).reduce((sum, f) => sum + f.size, 0);
  const limitBytes = settings.folderSizeLimitMb * 1024 * 1024;
  let idx = deleted;
  while (totalSize > limitBytes && idx < files.length) {
    const file = files[idx];
    try {
      secureDelete(file.path);
      totalSize -= file.size;
      deleted++;
      idx++;
    } catch {
      break;
    }
  }

  return { deleted };
}

export function startPruneSchedule(settings?: CaptureSettings): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }

  const s = settings ?? loadCaptureSettings();
  if (!s.saveToDisk || s.pruneIntervalMinutes <= 0) return;

  const intervalMs = s.pruneIntervalMinutes * 60 * 1000;
  pruneTimer = setInterval(() => {
    pruneScreenshots();
  }, intervalMs);
}

export function stopPruneSchedule(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

export function openScreenshotFolder(): void {
  const settings = loadCaptureSettings();
  ensureFolder(settings.screenshotFolder);
  shell.openPath(settings.screenshotFolder);
}
