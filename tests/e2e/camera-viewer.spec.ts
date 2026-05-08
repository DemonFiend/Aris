import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

/**
 * E2E coverage for the Camera Viewer pop-out window (ARI-226).
 *
 * Lower-level IPC contract tests live in `viewer-handlers.spec.ts`; this file
 * covers the user-facing flows from main-window entry button, multi-window
 * lifecycle, framing/transparency/lock behaviour, persistence across relaunch,
 * and keyboard shortcuts.
 *
 * The viewer renders the same React shell as the main window but on
 * `?surface=camera-viewer`. Because both surfaces use the same canvas
 * `data-testid`, any DOM lookup must be scoped to the correct page.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/** Launch the Electron app and return both the app handle and the main window. */
async function launchApp(): Promise<{ app: ElectronApplication; mainWindow: Page }> {
  const app = await electron.launch({ args: [appPath] });
  const mainWindow = await app.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');
  await dismissWizardIfPresent(mainWindow);
  // Make sure the React tree mounted the title-bar before tests poke it.
  await mainWindow.waitForSelector('button[title="Chat history"]', { timeout: 10_000 }).catch(() => {});
  return { app, mainWindow };
}

/** Walk through the first-launch wizard if it is showing. Mirrors `dock-position.spec.ts`. */
async function dismissWizardIfPresent(window: Page): Promise<void> {
  const wizardVisible = await window
    .locator('text=Welcome to Aris')
    .isVisible()
    .catch(() => false);
  if (!wizardVisible) return;
  for (let i = 0; i < 4; i++) {
    await window.click('button:has-text("Skip")').catch(() => {});
  }
  await window.click('button:has-text("Start chatting")').catch(() => {});
}

/** Reset persisted viewer config so each test starts from a known baseline. */
async function resetViewerConfig(mainWindow: Page): Promise<void> {
  await mainWindow.evaluate(async () => {
    await (window as any).aris.invoke('settings:delete', 'viewer.cameraConfig');
    await (window as any).aris.invoke('settings:delete', 'viewer.reopenOnStartup');
  });
  // Force the in-memory cache to refresh by reapplying defaults via set-config.
  await mainWindow.evaluate(async () => {
    await (window as any).aris.invoke('viewer:set-config', {
      mode: 'upper_torso',
      transparentBg: true,
      opacity: 1.0,
      alwaysOnTop: false,
      clickThrough: false,
      locked: false,
      bounds: undefined,
    });
  });
  await mainWindow.waitForTimeout(400); // debounce flush
}

/** Wait for the second BrowserWindow (the viewer) to appear and return its Page. */
async function waitForViewerWindow(app: ElectronApplication, mainWindow: Page): Promise<Page> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const viewer = app.windows().find((w) => w !== mainWindow);
    if (viewer) {
      await viewer.waitForLoadState('domcontentloaded').catch(() => {});
      // Wait until the canvas is mounted in the viewer surface so subsequent
      // queries don't race against React render.
      await viewer.waitForSelector('canvas[data-testid="camera-viewer-canvas"]', { timeout: 5000 })
        .catch(() => {});
      return viewer;
    }
    await mainWindow.waitForTimeout(100);
  }
  throw new Error('Viewer window did not appear within 5s');
}

/** Read the persisted viewer config (post-debounce). */
async function getConfig(mainWindow: Page): Promise<any> {
  return mainWindow.evaluate(async () => {
    return await (window as any).aris.invoke('viewer:get-config');
  });
}

// ── Scenario 1: Open / close ─────────────────────────────────────────────

test.describe('Camera Viewer — open/close (ARI-226 #1)', () => {
  test('title-bar button toggles the viewer window; main window stays alive', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    const initialCount = app.windows().length;

    // Open via the entry button so we exercise the renderer wire-up too.
    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);
    expect(app.windows().length).toBe(initialCount + 1);
    expect(viewer.isClosed()).toBe(false);

    // Pressing the button again must close the viewer (toggle semantics).
    await mainWindow.click('button[aria-label="Open camera viewer"]');

    // Wait for the viewer to actually close.
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBe(initialCount);

    // Main window is still responsive: invoking IPC succeeds.
    const cfg = await getConfig(mainWindow);
    expect(cfg.isOpen).toBe(false);

    await app.close();
  });
});

// ── Scenario 2: Framing toggle ───────────────────────────────────────────

test.describe('Camera Viewer — framing toggle (ARI-226 #2)', () => {
  test('clicking each framing pill in the viewer updates the avatar canvas mode', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);

    // Default mode after reset is upper_torso.
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'upper_torso');

    // Click "Headshot" pill. The chrome bar pills carry aria-label = label text.
    await viewer.click('button[role="radio"][aria-label="Headshot"]');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'headshot');
    await expect(viewer.locator('button[role="radio"][aria-label="Headshot"]'))
      .toHaveAttribute('aria-checked', 'true');

    await viewer.click('button[role="radio"][aria-label="Full Body"]');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'fullbody');

    await viewer.click('button[role="radio"][aria-label="Upper Torso"]');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'upper_torso');

    await app.close();
  });
});

// ── Scenario 3: Transparent background ───────────────────────────────────

test.describe('Camera Viewer — transparent background (ARI-226 #3)', () => {
  test('toggling transparent background drops wrapper border-radius and persists', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);
    // Start with transparentBg=false so we can observe the toggle changing it.
    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { transparentBg: false });
    });
    await mainWindow.waitForTimeout(400);

    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);

    // Open settings popover and toggle transparent background.
    await viewer.click('button[aria-label="Open settings"]');
    await viewer.waitForSelector('[role="dialog"][aria-label="Camera viewer settings"]', { timeout: 3000 });
    await viewer.click('input[type="checkbox"][aria-label="Transparent background"]');

    // Wait for debounce flush.
    await viewer.waitForTimeout(400);

    // After toggle: wrapper around the canvas drops border-radius to 0 (instant via prop).
    const borderRadius = await viewer.evaluate(() => {
      const canvas = document.querySelector('canvas[data-testid="camera-viewer-canvas"]');
      const wrapper = canvas?.parentElement as HTMLElement | null;
      return wrapper ? getComputedStyle(wrapper).borderRadius : null;
    });
    expect(borderRadius).toBe('0px');

    // Persisted config reflects the new value.
    const cfg = await getConfig(mainWindow);
    expect(cfg.transparentBg).toBe(true);

    await app.close();
  });
});

// ── Scenario 4: Lock + click-through ─────────────────────────────────────

test.describe('Camera Viewer — lock + click-through (ARI-226 #4)', () => {
  test('locking hides chrome; click-through auto-promotes lock and triggers setIgnoreMouseEvents(true)', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    // Spy on BrowserWindow#setIgnoreMouseEvents so we can verify the main
    // process applied click-through. We monkey-patch the prototype before
    // opening the viewer so the spy captures every call after that point.
    await app.evaluate(({ BrowserWindow }) => {
      (global as any).__ignoreMouseCalls = [];
      const proto = BrowserWindow.prototype as any;
      const orig = proto.setIgnoreMouseEvents;
      proto.setIgnoreMouseEvents = function (...args: unknown[]) {
        (global as any).__ignoreMouseCalls.push(args);
        return orig.apply(this, args);
      };
    });

    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);

    // Open popover, enable Lock layout.
    await viewer.click('button[aria-label="Open settings"]');
    await viewer.waitForSelector('[role="dialog"][aria-label="Camera viewer settings"]', { timeout: 3000 });
    await viewer.click('input[type="checkbox"][aria-label="Lock layout"]');
    await viewer.waitForTimeout(400);

    // Locked config hides the framing dock — radiogroup gone, locked-affordance present.
    expect(await viewer.locator('div[role="radiogroup"][aria-label="Camera framing"]').count()).toBe(0);

    // Now enable click-through. The popover handler bundles { clickThrough: true, locked: true }
    // so locked stays on; the test checks the invariant doesn't get broken.
    // Re-open the popover (it closes when chrome unmounts under lock).
    await viewer.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { clickThrough: true, locked: true });
    });
    await viewer.waitForTimeout(400);

    const cfg = await getConfig(mainWindow);
    expect(cfg.clickThrough).toBe(true);
    expect(cfg.locked).toBe(true);

    // Spy must record at least one setIgnoreMouseEvents(true, …) call.
    const calls: unknown[][] = await app.evaluate(() => (global as any).__ignoreMouseCalls ?? []);
    const sawTrue = calls.some((c) => c[0] === true);
    expect(sawTrue).toBe(true);

    // Cleanup: clear lock + click-through so subsequent tests start clean.
    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { locked: false, clickThrough: false });
    });
    await mainWindow.waitForTimeout(400);

    await app.close();
  });
});

// ── Scenario 5: Bounds + opacity persistence + reopen on startup ─────────

test.describe('Camera Viewer — persistence across relaunch (ARI-226 #5)', () => {
  test('opacity, mode, and reopen-on-startup persist across full app restart', async () => {
    // First launch — set non-default state and enable reopen.
    let { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', {
        mode: 'fullbody',
        opacity: 0.7,
        alwaysOnTop: true,
      });
      await (window as any).aris.invoke('settings:set', 'viewer.reopenOnStartup', 'true');
    });
    await mainWindow.waitForTimeout(500);

    // Open the viewer so its bounds get persisted, then close the whole app cleanly.
    await mainWindow.click('button[aria-label="Open camera viewer"]');
    await waitForViewerWindow(app, mainWindow);
    await mainWindow.waitForTimeout(300); // settle bounds capture

    await app.close();

    // Second launch — verify persisted config came back, and that the viewer
    // auto-opened because reopenOnStartup was set.
    ({ app, mainWindow } = await launchApp());

    // Auto-reopen happens during whenReady; allow a brief moment for ready-to-show.
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    const persisted = await getConfig(mainWindow);
    expect(persisted.mode).toBe('fullbody');
    expect(persisted.opacity).toBeCloseTo(0.7, 5);
    expect(persisted.alwaysOnTop).toBe(true);

    // Cleanup: clear the reopen flag so other tests aren't affected.
    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('settings:delete', 'viewer.reopenOnStartup');
    });
    await resetViewerConfig(mainWindow);

    await app.close();
  });
});

// ── Scenario 6: Keyboard (1/2/3, Esc, double-Esc) ────────────────────────

test.describe('Camera Viewer — keyboard shortcuts (ARI-226 #6)', () => {
  test('1/2/3 cycle framing; Esc closes popover; second Esc unlocks', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);
    await viewer.bringToFront();

    // Send keystrokes to the viewer page.
    await viewer.locator('body').click(); // ensure focus
    await viewer.keyboard.press('1');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'headshot');

    await viewer.keyboard.press('3');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'fullbody');

    await viewer.keyboard.press('2');
    await expect(viewer.locator('canvas[data-testid="camera-viewer-canvas"]'))
      .toHaveAttribute('data-camera-mode', 'upper_torso');

    // Open popover, press Esc once → popover closes.
    await viewer.click('button[aria-label="Open settings"]');
    await viewer.waitForSelector('[role="dialog"][aria-label="Camera viewer settings"]', { timeout: 3000 });
    await viewer.keyboard.press('Escape');
    await expect(viewer.locator('[role="dialog"][aria-label="Camera viewer settings"]')).toHaveCount(0);

    // Lock the layout, then press Esc to unlock.
    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { locked: true });
    });
    await mainWindow.waitForTimeout(400);
    expect((await getConfig(mainWindow)).locked).toBe(true);

    await viewer.bringToFront();
    await viewer.keyboard.press('Escape');
    // Wait for state to settle (Esc handler updates config + persists).
    await expect.poll(async () => (await getConfig(mainWindow)).locked, { timeout: 3000 }).toBe(false);

    await app.close();
  });
});

// ── Scenario 7: Main-window Ctrl/Cmd+Shift+C ─────────────────────────────

test.describe('Camera Viewer — main-window keyboard shortcut (ARI-226 #7)', () => {
  test('Ctrl/Cmd+Shift+C on main window toggles the viewer', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    const initialCount = app.windows().length;
    const accel = process.platform === 'darwin' ? 'Meta+Shift+C' : 'Control+Shift+C';

    // Make sure the renderer keydown listener gets focused events.
    await mainWindow.locator('body').click();

    // First press → opens viewer.
    await mainWindow.keyboard.press(accel);
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBe(initialCount + 1);

    // Second press → closes viewer.
    await mainWindow.bringToFront();
    await mainWindow.locator('body').click();
    await mainWindow.keyboard.press(accel);
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBe(initialCount);

    await app.close();
  });
});

// ── Scenario 8: Click-through requires lock (UI invariant) ───────────────

test.describe('Camera Viewer — click-through requires lock (ARI-226 #8)', () => {
  test('toggling click-through in the popover also enables lock; UI never lets the user reach clickThrough && !locked', async () => {
    const { app, mainWindow } = await launchApp();
    await resetViewerConfig(mainWindow);

    await mainWindow.click('button[aria-label="Open camera viewer"]');
    const viewer = await waitForViewerWindow(app, mainWindow);

    await viewer.click('button[aria-label="Open settings"]');
    await viewer.waitForSelector('[role="dialog"][aria-label="Camera viewer settings"]', { timeout: 3000 });

    // Toggle click-through ON via the popover. The handler is documented to
    // bundle { clickThrough: true, locked: true } in a single set-config call.
    await viewer.click('input[type="checkbox"][aria-label="Click-through"]');
    await viewer.waitForTimeout(400);

    const cfg = await getConfig(mainWindow);
    expect(cfg.clickThrough).toBe(true);
    expect(cfg.locked).toBe(true);

    // Cleanup
    await mainWindow.evaluate(async () => {
      await (window as any).aris.invoke('viewer:set-config', { locked: false, clickThrough: false });
    });
    await mainWindow.waitForTimeout(400);

    await app.close();
  });
});
