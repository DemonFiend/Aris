import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

/**
 * Proactive screen reaction smoke tests (ARI-197 Phase 5).
 *
 * We validate the contract surface — the ai:proactive-message IPC channel is
 * exposed through the preload bridge, and the app boots cleanly with the
 * reaction module wired into the capture pipeline.
 *
 * We do NOT trigger real game-detection reactions in CI — that requires a
 * live AI provider and a running game process. Functional end-to-end
 * validation of the reaction pipeline requires manual testing.
 */
test.describe('Proactive screen reactions', () => {
  test('ai:proactive-message channel is exposed to renderer', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Subscribe to the proactive message channel — this would throw if the
    // channel were not whitelisted in preload.ts.
    const subscribed = await window.evaluate(() => {
      try {
        const cleanup = (window as any).aris.on('ai:proactive-message', () => {});
        if (typeof cleanup === 'function') cleanup();
        return true;
      } catch {
        return false;
      }
    });

    expect(subscribed).toBe(true);

    await electronApp.close();
  });

  test('app boots cleanly with reaction module plumbed into capture pipeline', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const errors: string[] = [];
    window.on('pageerror', (err) => errors.push(err.message));

    // Give main process time to register IPC handlers (including the
    // reaction system) and renderer time to finish mounting listeners.
    await window.waitForTimeout(1000);

    const bridgeOk = await window.evaluate(() => typeof (window as any).aris?.invoke === 'function');
    expect(bridgeOk).toBe(true);
    expect(errors).toEqual([]);

    await electronApp.close();
  });
});
