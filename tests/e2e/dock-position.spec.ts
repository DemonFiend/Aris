import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Dock position system prompt', () => {
  test('includes "floating on screen" when dockPosition is floating', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Dismiss first-launch wizard if present
    const isWizard = await window
      .locator('text=Welcome to Aris')
      .isVisible()
      .catch(() => false);
    if (isWizard) {
      for (let i = 0; i < 4; i++) {
        await window.click('button:has-text("Skip")').catch(() => {});
      }
      await window.click('button:has-text("Start chatting")').catch(() => {});
      await window
        .waitForSelector('button[title="Chat history"]', { timeout: 10_000 })
        .catch(() => {});
    }

    // Override IPC handlers at the main process level (context bridge is frozen)
    await electronApp.evaluate(({ ipcMain }) => {
      // Remove existing handlers and replace with controlled stubs
      ipcMain.removeHandler('window:get-position-context');
      ipcMain.handle('window:get-position-context', () => ({
        dockPosition: 'floating',
        screenQuadrant: 'center',
        overlayMode: false,
        windowBounds: { x: 0, y: 0, width: 100, height: 100 },
        screenBounds: { width: 1920, height: 1080 },
      }));

      ipcMain.removeHandler('screen:get-position-state');
      ipcMain.handle('screen:get-position-state', () => null);

      // Capture the systemPrompt passed to ai:stream-chat
      (global as any).__capturedSystemPrompts = [];
      ipcMain.removeHandler('ai:stream-chat');
      ipcMain.handle('ai:stream-chat', (_event, _messages, options) => {
        (global as any).__capturedSystemPrompts.push(options?.systemPrompt ?? null);
        return null;
      });
    });

    // Send a message to trigger building of the system prompt
    await window.fill('textarea[placeholder*="Message Aris"]', 'Hello');
    await window.press('textarea[placeholder*="Message Aris"]', 'Enter');

    // Wait until the main process captured a system prompt
    await expect
      .poll(
        async () => {
          return await electronApp.evaluate(() => {
            return ((global as any).__capturedSystemPrompts ?? []).length;
          });
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    const prompt = await electronApp.evaluate(
      () => (global as any).__capturedSystemPrompts[0],
    );
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('floating on screen');

    await electronApp.close();
  });

  test('includes "on the left side of the screen" when dockPosition is left', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Dismiss first-launch wizard if present
    const isWizard = await window
      .locator('text=Welcome to Aris')
      .isVisible()
      .catch(() => false);
    if (isWizard) {
      for (let i = 0; i < 4; i++) {
        await window.click('button:has-text("Skip")').catch(() => {});
      }
      await window.click('button:has-text("Start chatting")').catch(() => {});
      await window
        .waitForSelector('button[title="Chat history"]', { timeout: 10_000 })
        .catch(() => {});
    }

    // Override IPC handlers at the main process level
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('window:get-position-context');
      ipcMain.handle('window:get-position-context', () => ({
        dockPosition: 'left',
        screenQuadrant: 'center',
        overlayMode: false,
        windowBounds: { x: 0, y: 0, width: 100, height: 100 },
        screenBounds: { width: 1920, height: 1080 },
      }));

      ipcMain.removeHandler('screen:get-position-state');
      ipcMain.handle('screen:get-position-state', () => null);

      (global as any).__capturedSystemPrompts = [];
      ipcMain.removeHandler('ai:stream-chat');
      ipcMain.handle('ai:stream-chat', (_event, _messages, options) => {
        (global as any).__capturedSystemPrompts.push(options?.systemPrompt ?? null);
        return null;
      });
    });

    // Send a message to trigger the system prompt build
    await window.fill('textarea[placeholder*="Message Aris"]', 'Hello again');
    await window.press('textarea[placeholder*="Message Aris"]', 'Enter');

    await expect
      .poll(
        async () => {
          return await electronApp.evaluate(() => {
            return ((global as any).__capturedSystemPrompts ?? []).length;
          });
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    const prompt = await electronApp.evaluate(
      () => (global as any).__capturedSystemPrompts[0],
    );
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('on the left side of the screen');

    await electronApp.close();
  });
});
