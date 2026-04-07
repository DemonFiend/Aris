import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Idle animation system', () => {
  test('companion config includes body idle and variation fields with defaults', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const config = await window.evaluate(async () => {
      try {
        return await (window as any).aris.invoke('companion:get-config');
      } catch {
        return null;
      }
    });

    expect(config).toBeTruthy();
    expect(config.idle).toBeTruthy();
    // Existing fields
    expect(typeof config.idle.breathingIntensity).toBe('number');
    expect(typeof config.idle.swayIntensity).toBe('number');
    expect(typeof config.idle.blinkFrequency).toBe('number');
    // New body idle fields
    expect(typeof config.idle.bodyIntensity).toBe('number');
    expect(config.idle.bodyIntensity).toBeGreaterThanOrEqual(0);
    expect(config.idle.bodyIntensity).toBeLessThanOrEqual(1);
    // Variation frequency field
    expect(typeof config.idle.variationFrequency).toBe('number');
    expect(config.idle.variationFrequency).toBeGreaterThanOrEqual(0);
    expect(config.idle.variationFrequency).toBeLessThanOrEqual(1);

    await electronApp.close();
  });

  test('companion config persists updated body idle settings', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        // Get current config
        const config = await (window as any).aris.invoke('companion:get-config');
        // Update with custom body intensity
        const updated = {
          ...config,
          idle: { ...config.idle, bodyIntensity: 0.7, variationFrequency: 0.3 },
        };
        await (window as any).aris.invoke('companion:set-config', updated);
        // Read back
        const readback = await (window as any).aris.invoke('companion:get-config');
        return { ok: true, bodyIntensity: readback.idle.bodyIntensity, variationFrequency: readback.idle.variationFrequency };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    expect((result as any).bodyIntensity).toBeCloseTo(0.7);
    expect((result as any).variationFrequency).toBeCloseTo(0.3);

    await electronApp.close();
  });
});
