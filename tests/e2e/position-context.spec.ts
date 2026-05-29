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

  test('active surface follows camera viewer when open and reverts on close (ARI-242)', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Move main window so its bounds are clearly distinct from the viewer's.
    const mainBW = await electronApp.browserWindow(window);
    await mainBW.evaluate((win) => win.setBounds({ x: 50, y: 50, width: 600, height: 400 }));
    await window.waitForTimeout(200);

    const beforeOpen = await window.evaluate(async () =>
      (window as any).aris.invoke('window:get-position-context'),
    );
    expect(beforeOpen).toBeTruthy();
    expect(beforeOpen.windowBounds.x).toBe(50);
    expect(beforeOpen.windowBounds.y).toBe(50);
    expect(beforeOpen.windowBounds.width).toBe(600);

    // Open the camera viewer.
    await window.evaluate(async () => (window as any).aris.invoke('viewer:open'));
    await window.waitForTimeout(900); // allow ready-to-show + show()

    // Move the viewer to a distinct location/size.
    const allWindows = electronApp.windows();
    expect(allWindows.length).toBeGreaterThanOrEqual(2);
    const viewerPage = allWindows.find((w) => w !== window);
    expect(viewerPage).toBeTruthy();
    const viewerBW = await electronApp.browserWindow(viewerPage!);
    await viewerBW.evaluate((win) =>
      win.setBounds({ x: 800, y: 600, width: 360, height: 480 }),
    );
    await window.waitForTimeout(300);

    const whileOpen = await window.evaluate(async () =>
      (window as any).aris.invoke('window:get-position-context'),
    );
    expect(whileOpen).toBeTruthy();
    expect(whileOpen.windowBounds.x).toBe(800);
    expect(whileOpen.windowBounds.y).toBe(600);
    expect(whileOpen.windowBounds.width).toBe(360);
    expect(whileOpen.windowBounds.height).toBe(480);

    // Close the viewer; active surface should revert to the main dock window.
    await window.evaluate(async () => (window as any).aris.invoke('viewer:close'));
    await window.waitForTimeout(800);

    const afterClose = await window.evaluate(async () =>
      (window as any).aris.invoke('window:get-position-context'),
    );
    expect(afterClose).toBeTruthy();
    expect(afterClose.windowBounds.x).toBe(50);
    expect(afterClose.windowBounds.y).toBe(50);
    expect(afterClose.windowBounds.width).toBe(600);

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
});
