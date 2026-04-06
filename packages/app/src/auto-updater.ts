import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import { APP_NAME } from '@aris/shared';

export function initAutoUpdater(): void {
  // Don't check for updates in development
  if (process.env.NODE_ENV === 'development') return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    dialog
      .showMessageBox(window, {
        type: 'info',
        title: `${APP_NAME} Update`,
        message: `Version ${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on('update-downloaded', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    dialog
      .showMessageBox(window, {
        type: 'info',
        title: `${APP_NAME} Update`,
        message: 'Update downloaded. Restart to apply?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', () => {
    // Silently fail — updates are best-effort
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}
