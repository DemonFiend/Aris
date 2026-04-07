import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Virtual space IPC (ARI-139)', () => {
  test('avatar:get-space-config returns default config with enabled=false', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const config = await window.evaluate(async () => {
      return await (window as any).aris.invoke('avatar:get-space-config');
    });

    expect(config).toBeTruthy();
    expect(config.enabled).toBe(false);
    expect(Array.isArray(config.groundSize)).toBe(true);
    expect(config.groundSize).toHaveLength(2);
    expect(typeof config.groundMaterial).toBe('string');
    expect(typeof config.groundColor).toBe('string');
    expect(typeof config.fogEnabled).toBe('boolean');
    expect(typeof config.backgroundMode).toBe('string');
    expect(typeof config.backgroundColor).toBe('string');

    await electronApp.close();
  });

  test('avatar:set-space-config persists enabled=true and get returns it', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const updated = await window.evaluate(async () => {
      return await (window as any).aris.invoke('avatar:set-space-config', { enabled: true });
    });

    expect(updated.enabled).toBe(true);

    const fetched = await window.evaluate(async () => {
      return await (window as any).aris.invoke('avatar:get-space-config');
    });

    expect(fetched.enabled).toBe(true);

    // Restore default
    await window.evaluate(async () => {
      await (window as any).aris.invoke('avatar:set-space-config', { enabled: false });
    });

    await electronApp.close();
  });

  test('avatar:set-space-config merges partial updates', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const updated = await window.evaluate(async () => {
      return await (window as any).aris.invoke('avatar:set-space-config', {
        groundMaterial: 'solid',
        groundColor: '#ff0000',
      });
    });

    expect(updated.groundMaterial).toBe('solid');
    expect(updated.groundColor).toBe('#ff0000');
    // Other defaults should be preserved
    expect(typeof updated.enabled).toBe('boolean');
    expect(typeof updated.backgroundMode).toBe('string');

    // Restore defaults
    await window.evaluate(async () => {
      await (window as any).aris.invoke('avatar:set-space-config', {
        groundMaterial: 'grid',
        groundColor: '#1a1a2e',
        enabled: false,
      });
    });

    await electronApp.close();
  });
});
