import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import * as path from 'path';
import type { CameraViewerConfig } from '@aris/shared';
import { DEFAULT_CAMERA_VIEWER_CONFIG } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';

const VIEWER_CONFIG_KEY = 'viewer.cameraConfig';
const VIEWER_REOPEN_KEY = 'viewer.reopenOnStartup';
const SET_CONFIG_DEBOUNCE_MS = 250;
const PERSIST_BOUNDS_DEBOUNCE_MS = 250;

let viewerWindow: BrowserWindow | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;
let currentConfig: CameraViewerConfig | null = null;
let setConfigTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPartial: Partial<CameraViewerConfig> | null = null;
let persistBoundsTimer: ReturnType<typeof setTimeout> | null = null;
let escShortcutRegistered = false;

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAMERA_VIEWER_CONFIG.opacity;
  return Math.max(0.4, Math.min(1.0, value));
}

function loadViewerConfig(): CameraViewerConfig {
  const raw = getSetting(VIEWER_CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CAMERA_VIEWER_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<CameraViewerConfig>;
    return {
      ...DEFAULT_CAMERA_VIEWER_CONFIG,
      ...parsed,
      // isOpen is runtime state — never restore as true on startup load
      isOpen: false,
      opacity: clampOpacity(parsed.opacity ?? DEFAULT_CAMERA_VIEWER_CONFIG.opacity),
    };
  } catch {
    return { ...DEFAULT_CAMERA_VIEWER_CONFIG };
  }
}

function persistViewerConfig(config: CameraViewerConfig): void {
  setSetting(VIEWER_CONFIG_KEY, JSON.stringify(config));
}

function getCurrentConfig(): CameraViewerConfig {
  if (!currentConfig) currentConfig = loadViewerConfig();
  return currentConfig;
}

function captureBounds(): CameraViewerConfig['bounds'] | undefined {
  if (!viewerWindow || viewerWindow.isDestroyed()) return undefined;
  const b = viewerWindow.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function applyWindowFlags(config: CameraViewerConfig): void {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  viewerWindow.setAlwaysOnTop(config.alwaysOnTop);
  viewerWindow.setOpacity(clampOpacity(config.opacity));
  if (config.clickThrough) {
    // forward: true allows hover/move events through for renderer-side hit testing
    viewerWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    viewerWindow.setIgnoreMouseEvents(false);
  }
  syncEscShortcut(config);
}

function syncEscShortcut(config: CameraViewerConfig): void {
  const need = !!viewerWindow && !viewerWindow.isDestroyed() && (config.locked || config.clickThrough);
  if (need && !escShortcutRegistered) {
    try {
      escShortcutRegistered = globalShortcut.register('Escape', () => {
        const cfg = getCurrentConfig();
        if (!cfg.locked && !cfg.clickThrough) return;
        const next: CameraViewerConfig = { ...cfg, locked: false, clickThrough: false };
        currentConfig = next;
        applyWindowFlags(next);
        const bounds = captureBounds() ?? next.bounds;
        const toPersist: CameraViewerConfig = { ...next, bounds };
        currentConfig = toPersist;
        persistViewerConfig(toPersist);
        broadcastConfig(toPersist);
      });
    } catch {
      escShortcutRegistered = false;
    }
  } else if (!need && escShortcutRegistered) {
    try {
      globalShortcut.unregister('Escape');
    } catch {
      /* ignore */
    }
    escShortcutRegistered = false;
  }
}

function broadcastConfig(config: CameraViewerConfig): void {
  const main = getMainWindow();
  if (main && !main.isDestroyed()) {
    main.webContents.send('viewer:state-changed', config);
  }
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('viewer:state-changed', config);
  }
}

function createCameraViewerWindow(initial: CameraViewerConfig): BrowserWindow {
  const bounds = initial.bounds;
  const win = new BrowserWindow({
    width: bounds?.width ?? 360,
    height: bounds?.height ?? 480,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 240,
    minHeight: 320,
    maxWidth: 1920,
    maxHeight: 1920,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    minimizable: false,
    skipTaskbar: false,
    show: false,
    title: 'Aris — Camera',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    void win.loadURL('http://localhost:5173/?surface=camera-viewer');
  } else {
    void win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'), {
      query: { surface: 'camera-viewer' },
    });
  }

  // Window-scoped Esc fallback for when the viewer has focus.
  // The globalShortcut handles the locked + clickThrough case where focus is lost.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      const cfg = getCurrentConfig();
      if (cfg.locked || cfg.clickThrough) {
        const next: CameraViewerConfig = { ...cfg, locked: false, clickThrough: false };
        currentConfig = next;
        applyWindowFlags(next);
        const bounds = captureBounds() ?? next.bounds;
        const toPersist: CameraViewerConfig = { ...next, bounds };
        currentConfig = toPersist;
        persistViewerConfig(toPersist);
        broadcastConfig(toPersist);
      }
    }
  });

  const schedulePersistBounds = () => {
    if (persistBoundsTimer) clearTimeout(persistBoundsTimer);
    persistBoundsTimer = setTimeout(() => {
      persistBoundsTimer = null;
      if (!viewerWindow || viewerWindow.isDestroyed()) return;
      const cfg = getCurrentConfig();
      const next: CameraViewerConfig = { ...cfg, bounds: captureBounds() };
      currentConfig = next;
      persistViewerConfig(next);
    }, PERSIST_BOUNDS_DEBOUNCE_MS);
  };
  win.on('move', schedulePersistBounds);
  win.on('resize', schedulePersistBounds);

  win.on('closed', () => {
    if (persistBoundsTimer) {
      clearTimeout(persistBoundsTimer);
      persistBoundsTimer = null;
    }
    const cfg = getCurrentConfig();
    const next: CameraViewerConfig = { ...cfg, isOpen: false };
    currentConfig = next;
    persistViewerConfig(next);
    viewerWindow = null;
    syncEscShortcut(next);
    broadcastConfig(next);
  });

  return win;
}

function openOrFocus(cfg: CameraViewerConfig): void {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    if (viewerWindow.isMinimized()) viewerWindow.restore();
    viewerWindow.show();
    viewerWindow.focus();
    applyWindowFlags(cfg);
    return;
  }
  viewerWindow = createCameraViewerWindow(cfg);
  viewerWindow.once('ready-to-show', () => {
    if (!viewerWindow || viewerWindow.isDestroyed()) return;
    applyWindowFlags(cfg);
    viewerWindow.show();
  });
}

export function registerViewerHandlers(mainWindowGetter: () => BrowserWindow | null): void {
  getMainWindow = mainWindowGetter;
  // Prime cache so first `viewer:get-config` is sync against persisted state.
  if (!currentConfig) currentConfig = loadViewerConfig();

  ipcMain.handle('viewer:open', async (_e, partial?: Partial<CameraViewerConfig>) => {
    const incoming = partial ?? {};
    const cfg: CameraViewerConfig = {
      ...getCurrentConfig(),
      ...incoming,
      isOpen: true,
      opacity: clampOpacity((incoming.opacity ?? getCurrentConfig().opacity)),
    };
    currentConfig = cfg;
    persistViewerConfig(cfg);
    openOrFocus(cfg);
    broadcastConfig(cfg);
    return cfg;
  });

  ipcMain.handle('viewer:close', async () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      const cfg = getCurrentConfig();
      const next: CameraViewerConfig = {
        ...cfg,
        isOpen: false,
        bounds: captureBounds() ?? cfg.bounds,
      };
      currentConfig = next;
      persistViewerConfig(next);
      viewerWindow.close();
    }
    return true;
  });

  ipcMain.handle('viewer:set-config', async (_e, partial: Partial<CameraViewerConfig>) => {
    pendingPartial = { ...(pendingPartial ?? {}), ...(partial ?? {}) };
    if (setConfigTimer) clearTimeout(setConfigTimer);
    setConfigTimer = setTimeout(() => {
      setConfigTimer = null;
      if (!pendingPartial) return;
      const merged: CameraViewerConfig = { ...getCurrentConfig(), ...pendingPartial };
      pendingPartial = null;
      merged.opacity = clampOpacity(merged.opacity);
      currentConfig = merged;
      applyWindowFlags(merged);
      const bounds = captureBounds() ?? merged.bounds;
      const toPersist: CameraViewerConfig = { ...merged, bounds };
      currentConfig = toPersist;
      persistViewerConfig(toPersist);
      broadcastConfig(toPersist);
    }, SET_CONFIG_DEBOUNCE_MS);
    return { ...getCurrentConfig(), ...(partial ?? {}) };
  });

  ipcMain.handle('viewer:get-config', async () => {
    return getCurrentConfig();
  });
}

/** Auto-open the viewer on startup when `viewer.reopenOnStartup` is true. */
export function maybeReopenViewerOnStartup(): void {
  const reopen = getSetting(VIEWER_REOPEN_KEY);
  if (reopen !== 'true') return;
  const cfg: CameraViewerConfig = { ...getCurrentConfig(), isOpen: true };
  currentConfig = cfg;
  persistViewerConfig(cfg);
  openOrFocus(cfg);
  broadcastConfig(cfg);
}

/** Force-close the viewer on app quit and persist final bounds. */
export function closeViewerForQuit(): void {
  if (setConfigTimer) {
    clearTimeout(setConfigTimer);
    setConfigTimer = null;
  }
  if (persistBoundsTimer) {
    clearTimeout(persistBoundsTimer);
    persistBoundsTimer = null;
  }
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    const cfg = getCurrentConfig();
    const finalCfg: CameraViewerConfig = {
      ...cfg,
      isOpen: false,
      bounds: captureBounds() ?? cfg.bounds,
    };
    currentConfig = finalCfg;
    persistViewerConfig(finalCfg);
    viewerWindow.destroy();
    viewerWindow = null;
  }
  if (escShortcutRegistered) {
    try {
      globalShortcut.unregister('Escape');
    } catch {
      /* ignore */
    }
    escShortcutRegistered = false;
  }
}
