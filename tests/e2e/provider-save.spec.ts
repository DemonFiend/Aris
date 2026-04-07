import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Provider save', () => {
  test('should save LM Studio config with localhost URL and model without error', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Save an LM Studio config with a localhost URL and a model name
    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).aris.invoke('ai:save-provider-config', {
          id: 'lmstudio',
          enabled: true,
          baseUrl: 'http://127.0.0.1:1234/v1',
          defaultModel: 'qwen3.5-4b',
        });
        return { ok: true, saved: res?.saved };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.saved).toBe(true);

    await electronApp.close();
  });

  test('should save LM Studio config with 0.0.0.0 bind address', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).aris.invoke('ai:save-provider-config', {
          id: 'lmstudio',
          enabled: true,
          baseUrl: 'http://0.0.0.0:1234/v1',
          defaultModel: 'qwen3.5-4b',
        });
        return { ok: true, saved: res?.saved };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.saved).toBe(true);

    await electronApp.close();
  });

  test('should reject non-HTTPS remote URL for any provider', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        await (window as any).aris.invoke('ai:save-provider-config', {
          id: 'lmstudio',
          enabled: true,
          baseUrl: 'http://evil.example.com:1234/v1',
          defaultModel: 'test-model',
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('HTTPS');

    await electronApp.close();
  });
});
