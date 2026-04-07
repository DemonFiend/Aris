import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Aris App Launch', () => {
  test('should launch the Electron app with renderer content loaded', async () => {
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Verify React mounted into #root (catches blank-page regressions)
    await window.waitForSelector('#root > *', { timeout: 10_000 });

    const rootChildCount = await window.locator('#root').evaluate(
      (el) => el.children.length,
    );
    expect(rootChildCount).toBeGreaterThan(0);

    // Title should be "Aris" from index.html
    const title = await window.title();
    expect(title).toMatch(/aris/i);

    await electronApp.close();
  });
});
