import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

/**
 * Beat reactivity smoke tests.
 *
 * We validate the contract surface — CompanionConfig exposes the new
 * `beatReactivity` field with safe defaults, and the app boots cleanly while
 * the BeatReactionController is instantiated in the avatar frame loop.
 *
 * We do NOT attempt real system-audio capture in CI — the renderer's
 * getUserMedia('desktop') path depends on Chromium/Electron runtime state
 * that is unreliable in a headless runner. Functional audio-driven motion
 * requires manual testing on a developer machine.
 */
test.describe('Beat reactivity', () => {
  test('companion config includes beatReactivity with safe defaults', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const config = await window.evaluate(async () => {
      return await (window as any).aris.invoke('companion:get-config');
    });

    expect(config).toBeTruthy();
    expect(config.beatReactivity).toBeDefined();
    // Must default OFF — capture is opt-in for privacy.
    expect(config.beatReactivity.enabled).toBe(false);
    expect(typeof config.beatReactivity.sensitivity).toBe('number');
    expect(config.beatReactivity.sensitivity).toBeGreaterThan(0);

    await electronApp.close();
  });

  test('app renders without errors with beat reactivity plumbed into avatar loop', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Collect any uncaught renderer errors during boot.
    const errors: string[] = [];
    window.on('pageerror', (err) => errors.push(err.message));

    // Give the scene a moment to spin up the frame loop.
    await window.waitForTimeout(1000);

    // IPC bridge must still be healthy — proves main process is fine too.
    const bridgeOk = await window.evaluate(() => typeof (window as any).aris?.invoke === 'function');
    expect(bridgeOk).toBe(true);
    expect(errors).toEqual([]);

    await electronApp.close();
  });
});
