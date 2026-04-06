import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('Aris App Launch', () => {
  test('should launch the Electron app', async () => {
    const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();
    await expect(window).toHaveTitle(/Aris/i);

    await electronApp.close();
  });

  test('should show the chat view by default', async () => {
    const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();
    const chatInput = window.locator('[data-testid="chat-input"], textarea, input[type="text"]');
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    await electronApp.close();
  });

  test('should navigate to settings', async () => {
    const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();
    const settingsBtn = window.locator('[data-testid="settings-btn"], button:has-text("Settings"), button[aria-label*="settings" i]');
    await settingsBtn.click();

    const settingsPanel = window.locator('[data-testid="settings-panel"], [class*="settings" i]');
    await expect(settingsPanel).toBeVisible({ timeout: 5_000 });

    await electronApp.close();
  });
});
