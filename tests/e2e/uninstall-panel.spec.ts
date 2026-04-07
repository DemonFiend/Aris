import { test, expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import type { UninstallTarget, UninstallResult } from '@aris/shared';

let electronApp: ElectronApplication;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(process.cwd(), 'packages/app/dist/main.js')],
  });
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Uninstall IPC', () => {
  test('uninstall:scan returns targets with correct shape', async () => {
    const page = await electronApp.firstWindow();

    const targets = (await page.evaluate(() =>
      window.aris.invoke('uninstall:scan'),
    )) as UninstallTarget[];

    expect(Array.isArray(targets)).toBe(true);
    // Should include the 4 services + aris-data
    expect(targets.length).toBe(5);

    const ids = new Set(targets.map((t) => t.id));
    expect(ids.has('lmstudio')).toBe(true);
    expect(ids.has('ollama')).toBe(true);
    expect(ids.has('kokoro')).toBe(true);
    expect(ids.has('whisper')).toBe(true);
    expect(ids.has('aris-data')).toBe(true);

    for (const t of targets) {
      expect(typeof t.displayName).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.isInstalled).toBe('boolean');
      expect(t.detectedPath === null || typeof t.detectedPath === 'string').toBe(true);
    }

    // aris-data must always be installed=true
    const arisData = targets.find((t) => t.id === 'aris-data');
    expect(arisData?.isInstalled).toBe(true);
  });

  test('uninstall:execute with empty array returns empty results', async () => {
    const page = await electronApp.firstWindow();

    const results = (await page.evaluate(() =>
      window.aris.invoke('uninstall:execute', []),
    )) as UninstallResult[];

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('uninstall:execute for not-detected service returns not-found', async () => {
    const page = await electronApp.firstWindow();

    // Whisper is almost certainly not running in CI / dev — but it might be installed.
    // We request the scan first to check.
    const targets = (await page.evaluate(() =>
      window.aris.invoke('uninstall:scan'),
    )) as UninstallTarget[];

    // Find a service that is NOT installed
    const notInstalled = targets.find((t) => t.id !== 'aris-data' && !t.isInstalled);
    if (!notInstalled) {
      // All services installed — skip gracefully
      return;
    }

    const results = (await page.evaluate(
      (id) => window.aris.invoke('uninstall:execute', [id]),
      notInstalled.id,
    )) as UninstallResult[];

    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(notInstalled.id);
    expect(results[0]!.status).toBe('not-found');
  });
});

test.describe('Uninstall panel UI', () => {
  test('Services tab renders uninstall panel with all 5 targets', async () => {
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

    // Wait for the uninstall panel to appear
    await page.waitForSelector('[data-testid="uninstall-panel"]', { timeout: 15_000 });

    // All 5 targets should be rendered
    await page.waitForSelector('[data-testid="uninstall-target-lmstudio"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="uninstall-target-ollama"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="uninstall-target-kokoro"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="uninstall-target-whisper"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="uninstall-target-aris-data"]', { timeout: 5_000 });

    // Continue button should be present
    await expect(page.locator('[data-testid="uninstall-next"]')).toBeVisible();
  });

  test('Continue button advances to confirm step when items are selected', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Ensure we're on Services tab already (or navigate there)
    const settingsBtn = page.locator('[title="Settings"], [title="Back to chat"]');
    const title = await settingsBtn.getAttribute('title');
    if (title !== 'Back to chat') {
      await settingsBtn.click();
    }
    await page.getByRole('button', { name: /Services/i }).click();
    await page.waitForSelector('[data-testid="uninstall-panel"]', { timeout: 15_000 });

    // At least aris-data is pre-selected, so Continue should be enabled
    const nextBtn = page.locator('[data-testid="uninstall-next"]');
    await nextBtn.waitFor({ timeout: 5_000 });

    // If it's enabled, proceed to confirm
    const isDisabled = await nextBtn.isDisabled();
    if (!isDisabled) {
      await nextBtn.click();
      // Confirm screen should appear
      await page.waitForSelector('[data-testid="uninstall-confirm"]', { timeout: 5_000 });
      await expect(page.locator('[data-testid="uninstall-confirm-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="uninstall-back"]')).toBeVisible();

      // Go back
      await page.locator('[data-testid="uninstall-back"]').click();
      await page.waitForSelector('[data-testid="uninstall-next"]', { timeout: 3_000 });
    }
  });

  test('Deselecting all targets disables Continue button', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Services tab
    const settingsBtn = page.locator('[title="Settings"], [title="Back to chat"]');
    const title = await settingsBtn.getAttribute('title');
    if (title !== 'Back to chat') {
      await settingsBtn.click();
    }
    await page.getByRole('button', { name: /Services/i }).click();
    await page.waitForSelector('[data-testid="uninstall-panel"]', { timeout: 15_000 });

    // Uncheck all checkboxes
    const checkboxes = page.locator('[data-testid^="uninstall-check-"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      const checked = await cb.isChecked();
      if (checked) await cb.click();
    }

    // Continue button should be disabled
    await expect(page.locator('[data-testid="uninstall-next"]')).toBeDisabled();
  });
});
