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

  test('should save LM Studio config with LAN/private network IP over HTTP', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).aris.invoke('ai:save-provider-config', {
          id: 'lmstudio',
          enabled: true,
          baseUrl: 'http://192.168.1.100:1234/v1',
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

  test('should persist active provider across app restart', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Save and activate Ollama provider (doesn't need a running server)
    await window.evaluate(async () => {
      await (window as any).aris.invoke('ai:save-provider-config', {
        id: 'ollama',
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434',
        defaultModel: 'llama3',
      });
      await (window as any).aris.invoke('ai:set-provider', 'ollama');
    });

    await electronApp.close();

    // Relaunch app and check active provider is restored
    const electronApp2 = await electron.launch({ args: [appPath] });
    const window2 = await electronApp2.firstWindow();
    await window2.waitForLoadState('domcontentloaded');

    const result = await window2.evaluate(async () => {
      try {
        const providers = await (window as any).aris.invoke('ai:get-providers');
        // getActive() would throw "No active AI provider set" if not restored
        const models = await (window as any).aris.invoke('ai:get-models', 'ollama');
        return { hasOllama: providers.some((p: any) => p.id === 'ollama'), restored: true };
      } catch (err: any) {
        return { hasOllama: false, restored: false, error: err.message };
      }
    });

    expect(result.hasOllama).toBe(true);
    expect(result.restored).toBe(true);

    await electronApp2.close();
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
