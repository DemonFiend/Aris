import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Window Resize', () => {
  test('layout responds to window resize without visiting settings first', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);

    // Get initial canvas dimensions
    const initialSize = await window.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas
        ? { width: canvas.clientWidth, height: canvas.clientHeight }
        : null;
    });

    // Resize the Electron window to a larger size
    const page = window;
    const electronWindow = await electronApp.browserWindow(page);
    await electronWindow.evaluate((win) => win.setSize(800, 900));
    // Allow layout to settle
    await window.waitForTimeout(500);

    const afterGrow = await window.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas
        ? { width: canvas.clientWidth, height: canvas.clientHeight }
        : null;
    });

    // Resize back down
    await electronWindow.evaluate((win) => win.setSize(400, 500));
    await window.waitForTimeout(500);

    const afterShrink = await window.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas
        ? { width: canvas.clientWidth, height: canvas.clientHeight }
        : null;
    });

    // Canvas must exist in all states
    expect(initialSize).not.toBeNull();
    expect(afterGrow).not.toBeNull();
    expect(afterShrink).not.toBeNull();

    // After growing the window, canvas should be larger than initial
    expect(afterGrow!.width).toBeGreaterThan(initialSize!.width);
    expect(afterGrow!.height).toBeGreaterThan(initialSize!.height);

    // After shrinking, canvas should be smaller than the grown size
    expect(afterShrink!.width).toBeLessThan(afterGrow!.width);
    expect(afterShrink!.height).toBeLessThan(afterGrow!.height);

    await electronApp.close();
  });

  test('Three.js renderer updates size on window resize', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);

    // Resize the window
    const page = window;
    const electronWindow = await electronApp.browserWindow(page);
    await electronWindow.evaluate((win) => win.setSize(800, 900));
    await window.waitForTimeout(500);

    // Verify the canvas drawing buffer matches the display size
    const bufferMatchesDisplay = await window.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const expectedWidth = Math.floor(canvas.clientWidth * dpr);
      const expectedHeight = Math.floor(canvas.clientHeight * dpr);
      // Allow 2px tolerance for rounding
      return (
        Math.abs(canvas.width - expectedWidth) <= 2 &&
        Math.abs(canvas.height - expectedHeight) <= 2
      );
    });

    expect(bufferMatchesDisplay).toBe(true);

    await electronApp.close();
  });
});
