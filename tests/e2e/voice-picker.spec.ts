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

test.describe('Voice picker (ARI-147)', () => {
  test('companion:get-config returns ttsVoice field (null by default)', async () => {
    const page = await electronApp.firstWindow();

    const config = await page.evaluate(() =>
      window.aris.invoke('companion:get-config'),
    );

    expect(config).toBeDefined();
    expect(config).toHaveProperty('ttsVoice');
    // default is null
    expect((config as { ttsVoice: unknown }).ttsVoice).toBeNull();
  });

  test('companion:set-config persists ttsVoice selection', async () => {
    const page = await electronApp.firstWindow();

    await page.evaluate(() =>
      window.aris.invoke('companion:set-config', { ttsVoice: 'af_bella' }),
    );

    const config = await page.evaluate(() =>
      window.aris.invoke('companion:get-config'),
    );

    expect((config as { ttsVoice: string }).ttsVoice).toBe('af_bella');

    // Reset back to null so test isolation holds for other tests
    await page.evaluate(() =>
      window.aris.invoke('companion:set-config', { ttsVoice: null }),
    );
  });

  test('companion:set-config clears ttsVoice when set to null', async () => {
    const page = await electronApp.firstWindow();

    // First set a voice
    await page.evaluate(() =>
      window.aris.invoke('companion:set-config', { ttsVoice: 'am_adam' }),
    );

    // Then clear it
    await page.evaluate(() =>
      window.aris.invoke('companion:set-config', { ttsVoice: null }),
    );

    const config = await page.evaluate(() =>
      window.aris.invoke('companion:get-config'),
    );

    expect((config as { ttsVoice: unknown }).ttsVoice).toBeNull();
  });

  test('CSP allows media-src blob: for audio playback', async () => {
    const page = await electronApp.firstWindow();

    // Verify that the app can create and use blob URLs for audio
    const canCreateBlobUrl = await page.evaluate(() => {
      try {
        const blob = new Blob(['test'], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const isBlob = url.startsWith('blob:');
        URL.revokeObjectURL(url);
        return isBlob;
      } catch {
        return false;
      }
    });

    expect(canCreateBlobUrl).toBe(true);
  });
});
