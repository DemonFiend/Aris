import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const appPath = path.resolve(__dirname, '../../../packages/app/dist/main.js');

export interface LaunchArisOptions {
  /** Avatar files (filename -> VRM bytes) to seed into userData/avatars before the chat view mounts. */
  avatars?: Record<string, Buffer>;
  /** Which seeded avatar filename to set as the default (loaded by AvatarDisplay). */
  defaultAvatar?: string;
  /**
   * Mark first-launch setup complete and reload so the chat view (and its
   * AvatarDisplay) mounts directly instead of the setup wizard. Default true.
   */
  markSetupComplete?: boolean;
}

export interface LaunchArisResult {
  electronApp: ElectronApplication;
  window: Page;
  userDataDir: string;
  /** Close the app and remove the isolated userData dir (tolerates Windows lock races). */
  close: () => Promise<void>;
}

/**
 * Launch Aris (Electron) in an isolated `--user-data-dir`, optionally seed a
 * chosen avatar, mark setup complete, and return the window with the chat
 * AvatarDisplay mounted.
 *
 * Mirrors the isolated-userData pattern proven in avatar-preview.spec.ts so
 * tests don't depend on whatever avatars the host machine has imported.
 */
export async function launchAris(options: LaunchArisOptions = {}): Promise<LaunchArisResult> {
  const { avatars, defaultAvatar, markSetupComplete = true } = options;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-test-'));
  const electronApp = await electron.launch({
    args: [appPath, `--user-data-dir=${userDataDir}`],
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  if (avatars && Object.keys(avatars).length > 0) {
    const userDataPath = await electronApp.evaluate(async ({ app }) => app.getPath('userData'));
    const avatarsDir = path.join(userDataPath, 'avatars');
    fs.mkdirSync(avatarsDir, { recursive: true });
    for (const [filename, bytes] of Object.entries(avatars)) {
      fs.writeFileSync(path.join(avatarsDir, filename), bytes);
    }
    if (defaultAvatar) {
      await window.evaluate(async (name) => {
        await (window as unknown as { aris: { invoke: (c: string, a: string) => Promise<unknown> } }).aris.invoke(
          'avatar:set-default',
          name,
        );
      }, defaultAvatar);
    }
  }

  if (markSetupComplete) {
    await window.evaluate(async () => {
      await (window as unknown as { aris: { invoke: (c: string) => Promise<unknown> } }).aris.invoke('setup:mark-complete');
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
  }

  const close = async () => {
    await electronApp.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* On Windows the SQLite db can stay briefly locked after exit; the OS reclaims the temp dir. */
    }
  };

  return { electronApp, window, userDataDir, close };
}
