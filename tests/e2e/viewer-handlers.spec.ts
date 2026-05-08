import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Camera Viewer IPC (ARI-228)', () => {
  test('viewer:get-config returns CameraViewerConfig shape with defaults', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const config = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:get-config');
    });

    expect(config).toBeTruthy();
    expect(typeof config.isOpen).toBe('boolean');
    expect(typeof config.mode).toBe('string');
    expect(['headshot', 'upper_torso', 'fullbody']).toContain(config.mode);
    expect(typeof config.transparentBg).toBe('boolean');
    expect(typeof config.opacity).toBe('number');
    expect(config.opacity).toBeGreaterThanOrEqual(0.4);
    expect(config.opacity).toBeLessThanOrEqual(1.0);
    expect(typeof config.alwaysOnTop).toBe('boolean');
    expect(typeof config.clickThrough).toBe('boolean');
    expect(typeof config.locked).toBe('boolean');

    await electronApp.close();
  });

  test('viewer:set-config persists changes after debounce', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', {
        mode: 'fullbody',
        opacity: 0.75,
        alwaysOnTop: true,
      });
    });

    // Debounce is 250ms; wait long enough for it to flush.
    await window.waitForTimeout(400);

    const fetched = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:get-config');
    });

    expect(fetched.mode).toBe('fullbody');
    expect(fetched.opacity).toBeCloseTo(0.75, 5);
    expect(fetched.alwaysOnTop).toBe(true);

    // Restore defaults so subsequent tests aren't polluted
    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', {
        mode: 'upper_torso',
        opacity: 1.0,
        alwaysOnTop: false,
      });
    });
    await window.waitForTimeout(400);

    await electronApp.close();
  });

  test('viewer:set-config clamps opacity into [0.4, 1.0]', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { opacity: 5 });
    });
    await window.waitForTimeout(400);

    const high = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:get-config');
    });
    expect(high.opacity).toBe(1.0);

    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { opacity: 0.1 });
    });
    await window.waitForTimeout(400);

    const low = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:get-config');
    });
    expect(low.opacity).toBe(0.4);

    // Restore default
    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { opacity: 1.0 });
    });
    await window.waitForTimeout(400);

    await electronApp.close();
  });

  test('viewer:open spawns a second BrowserWindow and viewer:close removes it', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const initialCount = electronApp.windows().length;

    const opened = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:open');
    });
    expect(opened.isOpen).toBe(true);

    // Wait for second window to register with Electron
    await window.waitForTimeout(800);
    expect(electronApp.windows().length).toBe(initialCount + 1);

    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:close');
    });

    await window.waitForTimeout(800);
    expect(electronApp.windows().length).toBe(initialCount);

    const closedCfg = await window.evaluate(async () => {
      return await (window as any).aris.invoke('viewer:get-config');
    });
    expect(closedCfg.isOpen).toBe(false);

    await electronApp.close();
  });

  test('viewer:open is single-instance — repeat call focuses existing window', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const initialCount = electronApp.windows().length;

    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:open');
    });
    await window.waitForTimeout(600);
    const afterFirstOpen = electronApp.windows().length;
    expect(afterFirstOpen).toBe(initialCount + 1);

    // Calling open again should NOT spawn a second viewer window
    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:open');
    });
    await window.waitForTimeout(400);
    expect(electronApp.windows().length).toBe(afterFirstOpen);

    // Cleanup
    await window.evaluate(async () => {
      await (window as any).aris.invoke('viewer:close');
    });
    await window.waitForTimeout(400);

    await electronApp.close();
  });
});
