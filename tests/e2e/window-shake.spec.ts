import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Window shake detection', () => {
  test('window:shake event fires with correct intensity on rapid moves', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Set up a listener for window:shake events in the renderer
    await window.evaluate(() => {
      (window as any).__shakeEvents = [];
      (window as any).aris.on('window:shake', (event: unknown) => {
        (window as any).__shakeEvents.push(event);
      });
    });

    // Move the window rapidly via Electron API to trigger shake events
    const browserWindow = await electronApp.browserWindow(await electronApp.firstWindow());
    await browserWindow.evaluate(async (win) => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // Rapid movement: large deltas to exceed the 'hard' threshold (>=30px/tick)
      win.setPosition(200, 200);
      await delay(16);
      win.setPosition(250, 250);
      await delay(16);
      win.setPosition(200, 200);
      await delay(16);
      win.setPosition(260, 260);
      await delay(16);
      win.setPosition(200, 200);
      await delay(16);
    });

    // Allow polling ticks to propagate
    await window.waitForTimeout(200);

    const events = await window.evaluate(() => (window as any).__shakeEvents as unknown[]);
    expect(events.length).toBeGreaterThan(0);

    const validIntensities = ['light', 'medium', 'hard'];
    for (const ev of events as Array<{ intensity: string; velocityX: number; velocityY: number }>) {
      expect(validIntensities).toContain(ev.intensity);
      expect(typeof ev.velocityX).toBe('number');
      expect(typeof ev.velocityY).toBe('number');
    }

    await electronApp.close();
  });

  test('window:shake events stop when window is minimized', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const browserWindow = await electronApp.browserWindow(await electronApp.firstWindow());

    // Minimize the window — polling should stop
    await browserWindow.evaluate((win) => win.minimize());
    await window.waitForTimeout(100);

    // Record event count after minimizing
    await window.evaluate(() => {
      (window as any).__shakeEventsAfterMinimize = [];
      (window as any).aris.on('window:shake', (event: unknown) => {
        (window as any).__shakeEventsAfterMinimize.push(event);
      });
    });

    // Move the window while minimized — no shake events should fire
    await browserWindow.evaluate(async (win) => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      win.setPosition(300, 300);
      await delay(16);
      win.setPosition(400, 400);
      await delay(16);
    });

    await window.waitForTimeout(200);

    // Restore and verify no events were received during minimize
    await browserWindow.evaluate((win) => win.restore());
    await window.waitForTimeout(100);

    const eventsWhileMinimized = await window.evaluate(
      () => (window as any).__shakeEventsAfterMinimize as unknown[]
    );
    expect(eventsWhileMinimized.length).toBe(0);

    await electronApp.close();
  });

  test('window:shake polling resumes after window is restored', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const browserWindow = await electronApp.browserWindow(await electronApp.firstWindow());

    // Minimize then restore
    await browserWindow.evaluate((win) => win.minimize());
    await window.waitForTimeout(100);
    await browserWindow.evaluate((win) => win.restore());
    await window.waitForTimeout(100);

    // Now set up listener and shake the window
    await window.evaluate(() => {
      (window as any).__shakeEventsAfterRestore = [];
      (window as any).aris.on('window:shake', (event: unknown) => {
        (window as any).__shakeEventsAfterRestore.push(event);
      });
    });

    await browserWindow.evaluate(async (win) => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      win.setPosition(150, 150);
      await delay(16);
      win.setPosition(200, 200);
      await delay(16);
      win.setPosition(150, 150);
      await delay(16);
      win.setPosition(210, 210);
      await delay(16);
      win.setPosition(150, 150);
      await delay(16);
    });

    await window.waitForTimeout(200);

    const events = await window.evaluate(
      () => (window as any).__shakeEventsAfterRestore as unknown[]
    );
    expect(events.length).toBeGreaterThan(0);

    await electronApp.close();
  });
});
