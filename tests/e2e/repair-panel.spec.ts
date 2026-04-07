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

test.describe('Repair panel IPC', () => {
  test('services:detect-all returns 4 results with correct shape', async () => {
    const page = await electronApp.firstWindow();

    const results = await page.evaluate(() => window.aris.invoke('services:detect-all'));

    expect(Array.isArray(results)).toBe(true);
    expect((results as unknown[]).length).toBe(4);

    const names = new Set((results as Array<{ name: string }>).map((r) => r.name));
    expect(names.has('lmstudio')).toBe(true);
    expect(names.has('ollama')).toBe(true);
    expect(names.has('kokoro')).toBe(true);
    expect(names.has('whisper')).toBe(true);
  });

  test('install:verify returns updated detection result for each service', async () => {
    const page = await electronApp.firstWindow();

    for (const name of ['lmstudio', 'ollama', 'kokoro', 'whisper'] as const) {
      const result = await page.evaluate(
        (svc) => window.aris.invoke('install:verify', svc),
        name,
      );

      const r = result as Record<string, unknown>;
      expect(r['name']).toBe(name);
      expect(typeof r['installed']).toBe('boolean');
      expect(typeof r['running']).toBe('boolean');
      expect(r['version'] === null || typeof r['version'] === 'string').toBe(true);
      expect(r['endpoint'] === null || typeof r['endpoint'] === 'string').toBe(true);
      expect(r['error'] === null || typeof r['error'] === 'string').toBe(true);
    }
  });

  test('full repair flow: detect-all → get-info → verify returns consistent service names', async () => {
    const page = await electronApp.firstWindow();

    // Step 1: health check
    const detections = (await page.evaluate(() =>
      window.aris.invoke('services:detect-all'),
    )) as Array<{ name: string }>;

    // Step 2: get install info for all
    const infos = (await page.evaluate(() =>
      window.aris.invoke('install:get-all-info'),
    )) as Array<{ name: string }>;

    // Step 3: verify a service
    const verified = (await page.evaluate(() =>
      window.aris.invoke('install:verify', 'lmstudio'),
    )) as { name: string };

    // All three operations should report the same service names
    const detectionNames = new Set(detections.map((r) => r.name));
    const infoNames = new Set(infos.map((r) => r.name));

    expect(detectionNames).toEqual(infoNames);
    expect(verified.name).toBe('lmstudio');
  });
});

test.describe('Repair panel UI', () => {
  test('Services tab renders repair panel with all 4 service cards', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Ensure wizard is bypassed
    await page.evaluate(async () => {
      await (window as any).aris.invoke('setup:mark-complete');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#root > *', { timeout: 10_000 });

    // Navigate to Settings
    const settingsBtn = page.locator('[title="Settings"]');
    await settingsBtn.waitFor({ timeout: 5_000 });
    await settingsBtn.click();

    // Click the Services tab
    await page.getByRole('button', { name: /Services/i }).click();

    // All 4 service cards should appear after the scan completes
    await page.waitForSelector('[data-testid="service-card-lmstudio"]', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="service-card-ollama"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="service-card-kokoro"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="service-card-whisper"]', { timeout: 5_000 });

    // Re-check button should be present
    await expect(page.locator('[data-testid="repair-rescan"]')).toBeVisible();
  });

  test('Re-check all button triggers a new scan', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Ensure we are in Settings > Services tab
    const settingsBtn = page.locator('[title="Settings"], [title="Back to chat"]');
    const title = await settingsBtn.getAttribute('title');
    if (title === 'Back to chat') {
      // Already in settings - click Services tab
    } else {
      await settingsBtn.click();
    }

    await page.getByRole('button', { name: /Services/i }).click();

    // Wait for initial scan to complete
    await page.waitForSelector('[data-testid="service-card-lmstudio"]', { timeout: 15_000 });

    // Click re-check button
    const rescanBtn = page.locator('[data-testid="repair-rescan"]');
    await rescanBtn.click();

    // Button should briefly show "Scanning…" then settle
    // After scan, service cards should still be present
    await page.waitForSelector('[data-testid="service-card-lmstudio"]', { timeout: 15_000 });
    await expect(rescanBtn).toBeEnabled({ timeout: 15_000 });
  });

  test('Fix button expands install guidance for a service', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Settings > Services
    const settingsBtn = page.locator('[title="Settings"], [title="Back to chat"]');
    const title = await settingsBtn.getAttribute('title');
    if (title !== 'Back to chat') {
      await settingsBtn.click();
    }
    await page.getByRole('button', { name: /Services/i }).click();
    await page.waitForSelector('[data-testid="service-card-lmstudio"]', { timeout: 15_000 });

    // Find the first service that has a Fix button (not running)
    const fixButtons = page.locator('[data-testid^="fix-btn-"]');
    const fixCount = await fixButtons.count();

    if (fixCount > 0) {
      const firstFix = fixButtons.first();
      const testId = await firstFix.getAttribute('data-testid');
      const serviceName = testId?.replace('fix-btn-', '') ?? 'lmstudio';

      await firstFix.click();

      // Fix panel should expand
      await page.waitForSelector(`[data-testid="fix-panel-${serviceName}"]`, { timeout: 5_000 });
      const fixPanel = page.locator(`[data-testid="fix-panel-${serviceName}"]`);
      await expect(fixPanel).toBeVisible();

      // Download button should eventually appear after install info loads
      await page.waitForSelector(`[data-testid="open-download-${serviceName}"]`, { timeout: 5_000 });
      await expect(page.locator(`[data-testid="open-download-${serviceName}"]`)).toBeVisible();
    }
    // If all services are running, Fix buttons won't appear — test passes trivially
  });
});
