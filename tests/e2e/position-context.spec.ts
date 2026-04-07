import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Position context system', () => {
  test('window:get-position-context returns valid position data', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const ctx = await window.evaluate(async () => {
      try {
        return await (window as any).aris.invoke('window:get-position-context');
      } catch {
        return null;
      }
    });

    expect(ctx).toBeTruthy();

    // Dock position must be one of the valid values
    const validDockPositions = ['top', 'bottom', 'left', 'right', 'floating', 'fullscreen'];
    expect(validDockPositions).toContain(ctx.dockPosition);

    // Screen quadrant must be one of the valid values
    const validQuadrants = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
    expect(validQuadrants).toContain(ctx.screenQuadrant);

    // Overlay mode should be boolean
    expect(typeof ctx.overlayMode).toBe('boolean');

    // Window bounds should have valid numbers
    expect(typeof ctx.windowBounds.x).toBe('number');
    expect(typeof ctx.windowBounds.y).toBe('number');
    expect(ctx.windowBounds.width).toBeGreaterThan(0);
    expect(ctx.windowBounds.height).toBeGreaterThan(0);

    // Screen bounds should have valid numbers
    expect(ctx.screenBounds.width).toBeGreaterThan(0);
    expect(ctx.screenBounds.height).toBeGreaterThan(0);

    await electronApp.close();
  });

  test('position context updates after window move', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Get initial position
    const initial = await window.evaluate(async () => {
      return await (window as any).aris.invoke('window:get-position-context');
    });
    expect(initial).toBeTruthy();

    // Move the BrowserWindow via Electron API
    const browserWindow = await electronApp.browserWindow(await electronApp.firstWindow());
    await browserWindow.evaluate((win) => {
      win.setPosition(100, 100);
    });

    // Small wait for event to propagate
    await window.waitForTimeout(200);

    const afterMove = await window.evaluate(async () => {
      return await (window as any).aris.invoke('window:get-position-context');
    });
    expect(afterMove).toBeTruthy();
    expect(afterMove.windowBounds.x).toBe(100);
    expect(afterMove.windowBounds.y).toBe(100);

    await electronApp.close();
  });

  test('overlay toggle IPC returns a boolean', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Toggle overlay on — IPC should return a boolean (the new state)
    const toggleResult = await window.evaluate(async () => {
      try {
        return await (window as any).aris.invoke('window:toggle-overlay');
      } catch {
        return null;
      }
    });
    expect(typeof toggleResult).toBe('boolean');

    // Toggle back to restore original state
    await window.evaluate(async () => {
      try {
        await (window as any).aris.invoke('window:toggle-overlay');
      } catch {
        // ignore
      }
    });

    await electronApp.close();
  });
});
