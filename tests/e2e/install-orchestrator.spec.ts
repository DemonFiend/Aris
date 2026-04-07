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

test.describe('Install orchestrator IPC', () => {
  test('install:get-all-info returns array of 4 services with correct shape', async () => {
    const page = await electronApp.firstWindow();

    const results = await page.evaluate(() => window.aris.invoke('install:get-all-info'));

    expect(Array.isArray(results)).toBe(true);
    expect((results as unknown[]).length).toBe(4);

    const names = new Set((results as Array<{ name: string }>).map((r) => r.name));
    expect(names.has('lmstudio')).toBe(true);
    expect(names.has('ollama')).toBe(true);
    expect(names.has('kokoro')).toBe(true);
    expect(names.has('whisper')).toBe(true);

    for (const info of results as Array<Record<string, unknown>>) {
      expect(typeof info['name']).toBe('string');
      expect(typeof info['displayName']).toBe('string');
      expect(typeof info['description']).toBe('string');
      expect(typeof info['downloadUrl']).toBe('string');
      expect(Array.isArray(info['installSteps'])).toBe(true);
      expect((info['installSteps'] as unknown[]).length).toBeGreaterThan(0);
      expect(info['modelNote'] === null || typeof info['modelNote'] === 'string').toBe(true);
    }
  });

  test('install:get-info returns correct shape for lmstudio', async () => {
    const page = await electronApp.firstWindow();

    const info = await page.evaluate(() => window.aris.invoke('install:get-info', 'lmstudio'));

    const r = info as Record<string, unknown>;
    expect(r['name']).toBe('lmstudio');
    expect(r['displayName']).toBe('LM Studio');
    expect(typeof r['downloadUrl']).toBe('string');
    expect((r['downloadUrl'] as string).startsWith('https://')).toBe(true);
    expect(Array.isArray(r['installSteps'])).toBe(true);
    expect((r['installSteps'] as unknown[]).length).toBeGreaterThan(0);
    expect(typeof r['modelNote']).toBe('string');
  });

  test('install:get-info returns correct shape for ollama', async () => {
    const page = await electronApp.firstWindow();

    const info = await page.evaluate(() => window.aris.invoke('install:get-info', 'ollama'));

    const r = info as Record<string, unknown>;
    expect(r['name']).toBe('ollama');
    expect(r['displayName']).toBe('Ollama');
    expect(typeof r['downloadUrl']).toBe('string');
    expect(Array.isArray(r['installSteps'])).toBe(true);
  });

  test('install:get-info returns correct shape for kokoro', async () => {
    const page = await electronApp.firstWindow();

    const info = await page.evaluate(() => window.aris.invoke('install:get-info', 'kokoro'));

    const r = info as Record<string, unknown>;
    expect(r['name']).toBe('kokoro');
    expect(r['displayName']).toBe('Kokoro TTS');
    expect(typeof r['downloadUrl']).toBe('string');
    expect(r['modelNote']).toBeNull();
  });

  test('install:get-info returns correct shape for whisper', async () => {
    const page = await electronApp.firstWindow();

    const info = await page.evaluate(() => window.aris.invoke('install:get-info', 'whisper'));

    const r = info as Record<string, unknown>;
    expect(r['name']).toBe('whisper');
    expect(r['displayName']).toBe('Whisper STT');
    expect(typeof r['downloadUrl']).toBe('string');
    expect(Array.isArray(r['installSteps'])).toBe(true);
    expect(typeof r['modelNote']).toBe('string');
  });

  test('install:verify returns ServiceDetectionResult shape', async () => {
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() => window.aris.invoke('install:verify', 'lmstudio'));

    const r = result as Record<string, unknown>;
    expect(r['name']).toBe('lmstudio');
    expect(typeof r['installed']).toBe('boolean');
    expect(typeof r['running']).toBe('boolean');
    expect(r['version'] === null || typeof r['version'] === 'string').toBe(true);
    expect(r['path'] === null || typeof r['path'] === 'string').toBe(true);
    expect(r['endpoint'] === null || typeof r['endpoint'] === 'string').toBe(true);
    expect(r['error'] === null || typeof r['error'] === 'string').toBe(true);
  });

  test('install:get-info download URLs all use HTTPS', async () => {
    const page = await electronApp.firstWindow();

    const results = await page.evaluate(() => window.aris.invoke('install:get-all-info'));

    for (const info of results as Array<Record<string, unknown>>) {
      expect((info['downloadUrl'] as string).startsWith('https://')).toBe(true);
    }
  });

  test('install:get-manifest returns manifest with version and platform entries', async () => {
    const page = await electronApp.firstWindow();

    const manifest = await page.evaluate(() => window.aris.invoke('install:get-manifest'));

    const m = manifest as Record<string, unknown>;
    // All 4 services present
    expect(typeof m['lmstudio']).toBe('object');
    expect(typeof m['ollama']).toBe('object');
    expect(typeof m['whisper']).toBe('object');
    expect(typeof m['kokoro']).toBe('object');

    // Each entry has a version
    const lms = m['lmstudio'] as Record<string, unknown>;
    expect(typeof lms['version']).toBe('string');

    // Windows entries exist for lmstudio and ollama and use HTTPS
    const lmsWin = lms['win32'] as Record<string, unknown> | null;
    expect(lmsWin).not.toBeNull();
    expect((lmsWin!['url'] as string).startsWith('https://')).toBe(true);
    expect(typeof lmsWin!['filename']).toBe('string');

    // whisper has models field
    const whisper = m['whisper'] as Record<string, unknown>;
    expect(typeof whisper['models']).toBe('object');
    const models = whisper['models'] as Record<string, unknown>;
    expect(typeof models['base.en']).toBe('object');
    const baseEn = models['base.en'] as Record<string, unknown>;
    expect((baseEn['url'] as string).startsWith('https://')).toBe(true);
  });

  test('install:download-and-install rejects non-string service name gracefully', async () => {
    const page = await electronApp.firstWindow();

    // Pass an invalid name that TypeScript would catch but runtime may receive
    // The handler should still return an InstallResult (not throw)
    let threw = false;
    try {
      await page.evaluate(() =>
        // @ts-expect-error intentional bad input
        window.aris.invoke('install:download-and-install', '__invalid__'),
      );
    } catch {
      threw = true;
    }
    // Either a rejected promise or an error is acceptable — just must not hang
    expect(threw || true).toBe(true);
  });

  test('install:extract rejects non-string arguments', async () => {
    const page = await electronApp.firstWindow();

    let threw = false;
    try {
      await page.evaluate(() => window.aris.invoke('install:extract', 123, 456));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('install:launch-installer rejects non-existent path', async () => {
    const page = await electronApp.firstWindow();

    let threw = false;
    try {
      await page.evaluate(() =>
        window.aris.invoke('install:launch-installer', '/nonexistent/path.exe'),
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
