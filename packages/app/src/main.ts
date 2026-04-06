import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { APP_NAME } from '@aris/shared';
import { registerIpcHandlers, initProviders } from './ipc-handlers';
import { registerVoiceHandlers } from './voice-handlers';
import { getDb, closeDb } from './database';

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
}

app.whenReady().then(() => {
  getDb(); // Initialize database and run migrations
  initProviders();
  registerIpcHandlers();
  registerVoiceHandlers();
  registerWindowHandlers();
  createTray();
  createWindow();
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
