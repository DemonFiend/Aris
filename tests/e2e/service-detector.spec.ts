import { test, expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';

let electronApp: ElectronApplication;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(process.cwd(), 'packages/app/dist/main.js')],
  });
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Service detector IPC', () => {
  test('services:detect-all returns array with correct shape for all services', async () => {
    const page = await electronApp.firstWindow();

    const results = await page.evaluate(() =>
      window.aris.invoke('services:detect-all'),
    );

    expect(Array.isArray(results)).toBe(true);
    expect((results as unknown[]).length).toBe(3);

    const names = new Set((results as Array<{ name: string }>).map((r) => r.name));
    expect(names.has('lmstudio')).toBe(true);
    expect(names.has('kokoro')).toBe(true);
    expect(names.has('whisper')).toBe(true);

    for (const result of results as Array<Record<string, unknown>>) {
      expect(typeof result['name']).toBe('string');
      expect(typeof result['installed']).toBe('boolean');
      expect(typeof result['running']).toBe('boolean');
      expect(result['version'] === null || typeof result['version'] === 'string').toBe(true);
      expect(result['path'] === null || typeof result['path'] === 'string').toBe(true);
      expect(result['endpoint'] === null || typeof result['endpoint'] === 'string').toBe(true);
      expect(result['error'] === null || typeof result['error'] === 'string').toBe(true);
    }
  });

  test('services:detect returns correct shape for lmstudio', async () => {
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() =>
      window.aris.invoke('services:detect', 'lmstudio'),
    );

    const r = result as Record<string, unknown>;
    expect(r['name']).toBe('lmstudio');
    expect(typeof r['installed']).toBe('boolean');
    expect(typeof r['running']).toBe('boolean');
    expect(r['version'] === null || typeof r['version'] === 'string').toBe(true);
    expect(r['path'] === null || typeof r['path'] === 'string').toBe(true);
    expect(r['endpoint'] === null || typeof r['endpoint'] === 'string').toBe(true);
    expect(r['error'] === null || typeof r['error'] === 'string').toBe(true);
  });

  test('services:detect returns correct shape for kokoro', async () => {
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() =>
      window.aris.invoke('services:detect', 'kokoro'),
    );

    const r = result as Record<string, unknown>;
    expect(r['name']).toBe('kokoro');
    expect(typeof r['running']).toBe('boolean');
  });

  test('services:detect returns correct shape for whisper', async () => {
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() =>
      window.aris.invoke('services:detect', 'whisper'),
    );

    const r = result as Record<string, unknown>;
    expect(r['name']).toBe('whisper');
    expect(typeof r['running']).toBe('boolean');
  });
});
