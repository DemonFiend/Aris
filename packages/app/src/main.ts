import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { APP_NAME } from '@aris/shared';
import { registerIpcHandlers, initProviders } from './ipc-handlers';
import { registerVoiceHandlers } from './voice-handlers';
import { registerAvatarHandlers } from './avatar-handlers';
import { registerCompanionHandlers } from './companion-handlers';
import { getDb, closeDb } from './database';
import { initAutoUpdater } from './auto-updater';
import { pathToFileURL } from 'url';

// Register custom avatar:// protocol as privileged (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'avatar',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    title: APP_NAME,
    frame: true,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In dev, load from Vite dev server; in prod, load built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Create a simple 16x16 tray icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Aris',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function registerWindowHandlers(): void {
  ipcMain.handle('window:toggle-overlay', async () => {
    if (!mainWindow) return false;
    const isOverlay = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOverlay);
    if (!isOverlay) {
      mainWindow.setOpacity(0.9);
    } else {
      mainWindow.setOpacity(1.0);
    }
    return !isOverlay;
  });

  ipcMain.handle('window:get-overlay', async () => {
    return mainWindow?.isAlwaysOnTop() ?? false;
  });

  ipcMain.handle('window:minimize-to-tray', async () => {
    mainWindow?.hide();
    return true;
  });

  ipcMain.handle('window:quit', async () => {
    isQuitting = true;
    app.quit();
  });
}

app.whenReady().then(() => {
  // Set a strict CSP that overrides the HTML meta tag.
  // In dev mode, Vite injects inline scripts for HMR so we must allow unsafe-inline.
  // In prod, all scripts are bundled into external files — no unsafe-inline needed.
  const isDev = process.env.NODE_ENV === 'development';
  const session = mainWindow?.webContents?.session ?? require('electron').session.defaultSession;
  session.webRequest.onHeadersReceived((details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => {
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
    const styleSrc = isDev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'";
    // In dev, allow all HTTP/WS for local servers. In prod, HTTPS only + localhost for local LLMs.
    const connectSrc = isDev
      ? "connect-src 'self' ws: wss: http: https: avatar:"
      : "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:* avatar:";
    const csp = [
      "default-src 'self' avatar:",
      scriptSrc,
      styleSrc,
      "img-src 'self' data: blob: avatar:",
      connectSrc,
      "worker-src 'self' blob:",
    ].join('; ');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Register avatar:// protocol handler to serve VRM files from user data
  const avatarDir = path.join(app.getPath('userData'), 'avatars');
  protocol.handle('avatar', (request) => {
    const url = new URL(request.url);
    // avatar://filename.vrm -> host is the filename
    const filename = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/, ''));
    const filePath = path.resolve(avatarDir, filename);

    // Guard against path traversal (e.g. avatar://../../etc/passwd)
    if (!filePath.startsWith(avatarDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  getDb(); // Initialize database and run migrations
  initProviders();
  registerIpcHandlers();
  registerVoiceHandlers();
  registerAvatarHandlers();
  registerCompanionHandlers();
  registerWindowHandlers();
  createTray();
  createWindow();
  initAutoUpdater();
});

app.on('before-quit', () => {
  isQuitting = true;
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
