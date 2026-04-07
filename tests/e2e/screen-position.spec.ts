import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Screen position IPC', () => {
  test('screen:get-monitors returns an array with at least one monitor', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const monitors = await window.evaluate(async () => {
      return await (window as any).aris.invoke('screen:get-monitors');
    });

    expect(Array.isArray(monitors)).toBe(true);
    expect(monitors.length).toBeGreaterThan(0);

    const m = monitors[0];
    expect(typeof m.id).toBe('number');
    expect(typeof m.label).toBe('string');
    expect(m.label).toMatch(/^Monitor \d+$/);
    expect(typeof m.index).toBe('number');
    expect(m.index).toBe(0);
    expect(typeof m.isPrimary).toBe('boolean');
    expect(typeof m.bounds.x).toBe('number');
    expect(typeof m.bounds.y).toBe('number');
    expect(m.bounds.width).toBeGreaterThan(0);
    expect(m.bounds.height).toBeGreaterThan(0);

    await electronApp.close();
  });

  test('screen:get-position-state returns null position fields when mode is disabled', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Explicitly set disabled mode to ensure a clean state
    await window.evaluate(async () => {
      await (window as any).aris.invoke('screen:set-mode', 'disabled');
    });

    const state = await window.evaluate(async () => {
      return await (window as any).aris.invoke('screen:get-position-state');
    });

    expect(state).toBeTruthy();
    expect(state.mode).toBe('disabled');
    expect(Array.isArray(state.monitors)).toBe(true);
    expect(state.activeMonitorIndex).toBeNull();
    expect(state.activeGridCell).toBeNull();
    expect(state.globalPosition).toBeNull();

    await electronApp.close();
  });

  test('screen:set-mode persists mode and screen:get-position-state reflects it', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Switch to auto mode
    await window.evaluate(async () => {
      await (window as any).aris.invoke('screen:set-mode', 'auto');
    });

    const state = await window.evaluate(async () => {
      return await (window as any).aris.invoke('screen:get-position-state');
    });

    expect(state.mode).toBe('auto');
    expect(state.activeMonitorIndex).not.toBeNull();
    expect(state.activeGridCell).toBeGreaterThanOrEqual(1);
    expect(state.activeGridCell).toBeLessThanOrEqual(9);
    expect(state.globalPosition).toBeGreaterThanOrEqual(1);

    await electronApp.close();
  });

  test('screen:set-custom-position stores custom cell and globalPosition formula is correct', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Determine the active monitor index via auto mode first
    await window.evaluate(async () => {
      await (window as any).aris.invoke('screen:set-mode', 'auto');
    });
    const autoState = await window.evaluate(async () => {
      return await (window as any).aris.invoke('screen:get-position-state');
    });
    const activeIdx: number = autoState.activeMonitorIndex ?? 0;

    // Switch to custom mode and set cell 5 on the active monitor
    await window.evaluate(async (idx: number) => {
      await (window as any).aris.invoke('screen:set-mode', 'custom');
      await (window as any).aris.invoke('screen:set-custom-position', idx, 5);
    }, activeIdx);

    const state = await window.evaluate(async () => {
      return await (window as any).aris.invoke('screen:get-position-state');
    });

    expect(state.mode).toBe('custom');
    // globalPosition formula: monitorIndex * 9 + cell
    expect(state.positions[activeIdx]).toBe(5);
    expect(state.globalPosition).toBe(activeIdx * 9 + 5);

    await electronApp.close();
  });
});
