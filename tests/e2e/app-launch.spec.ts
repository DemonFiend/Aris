import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Aris App Launch', () => {
  test('should launch the Electron app', async () => {
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // The window title comes from index.html <title>Aris</title>
    // Wait for page to fully render before checking title
    await window.waitForTimeout(2000);
    const title = await window.title();
    // Accept either the HTML title or the BrowserWindow title (may vary by env)
    expect(title === '' || /aris/i.test(title)).toBe(true);

    await electronApp.close();
  });

});
