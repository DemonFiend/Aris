import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createMinimalVRM } from '../fixtures/create-test-vrm';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Avatar preview rendering', () => {
  test('should create a WebGL canvas that renders non-black content', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      document.body.appendChild(canvas);

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { ok: false, reason: 'no-webgl' };

      gl.clearColor(0.2, 0.3, 0.5, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const pixels = new Uint8Array(4);
      gl.readPixels(100, 100, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      document.body.removeChild(canvas);
      return { ok: true, r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
    });

    expect(result.ok).toBe(true);
    expect((result as any).r + (result as any).g + (result as any).b).toBeGreaterThan(0);

    await electronApp.close();
  });

  test('should handle resize with zero dimensions gracefully', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;
      document.body.appendChild(canvas);

      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        document.body.removeChild(canvas);
        return { ok: true, hasContext: !!gl };
      } catch (e: any) {
        document.body.removeChild(canvas);
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    await electronApp.close();
  });

  test('should load a VRM model from the avatars directory', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Seed a test VRM into the app's userData/avatars directory
    const userDataPath = await electronApp.evaluate(async ({ app: electronApp }) => {
      return electronApp.getPath('userData');
    });
    const avatarsDir = path.join(userDataPath, 'avatars');
    fs.mkdirSync(avatarsDir, { recursive: true });
    fs.writeFileSync(path.join(avatarsDir, 'test-avatar.vrm'), createMinimalVRM());

    // Verify the avatar:list-available IPC returns our seeded model
    const avatars = await window.evaluate(async () => {
      return window.aris.invoke('avatar:list-available');
    });
    expect(avatars).toEqual(
      expect.arrayContaining([expect.objectContaining({ filename: 'test-avatar.vrm' })]),
    );

    // Set it as default and verify
    await window.evaluate(async () => {
      await window.aris.invoke('avatar:set-default', 'test-avatar.vrm');
    });

    const defaultAvatar = await window.evaluate(async () => {
      return window.aris.invoke('avatar:get-default');
    });
    expect(defaultAvatar).toEqual(expect.objectContaining({ filename: 'test-avatar.vrm' }));

    // Verify the avatar:// protocol serves the file
    const fetchResult = await window.evaluate(async () => {
      try {
        const res = await fetch('avatar://test-avatar.vrm');
        return { ok: res.ok, status: res.status, size: (await res.arrayBuffer()).byteLength };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });
    expect(fetchResult.ok).toBe(true);
    expect((fetchResult as any).size).toBeGreaterThan(0);

    // Clean up
    fs.unlinkSync(path.join(avatarsDir, 'test-avatar.vrm'));
    await electronApp.close();
  });

  test('should expose VRM load status and reach a terminal state (not stuck loading)', async () => {
    // Isolated userData so the bundled default VRM is auto-seeded and loaded,
    // rather than depending on whatever the host machine has imported.
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-test-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Fresh userData shows the first-launch wizard, which hides the chat
      // avatar. Mark setup complete via IPC and reload so the chat view
      // (and AvatarDisplay) mounts directly.
      await window.evaluate(async () => {
        await (window as any).aris.invoke('setup:mark-complete');
      });
      await window.reload();
      await window.waitForLoadState('domcontentloaded');

      const canvas = window.locator('[data-testid="camera-viewer-canvas"]');
      // The avatar must reach a terminal state — never stay stuck on 'loading'.
      // This is the observability signal tests need to wait on VRM load.
      await expect(canvas).toHaveAttribute('data-vrm-status', /loaded|fallback|error/, {
        timeout: 15_000,
      });

      const status = await canvas.getAttribute('data-vrm-status');
      expect(['loaded', 'fallback', 'error']).toContain(status);

      // Read-only test inspector must agree with the DOM signal, so specs can
      // both wait on the attribute and introspect bone state.
      const inspected = await window.evaluate(() => {
        return (window as any).__arisE2E?.getVrmStatus?.() ?? null;
      });
      expect(inspected).not.toBeNull();
      expect(inspected.status).toBe(status);

      if (status === 'loaded') {
        // A real VRM loaded — filename and humanoid flag must be populated.
        expect(await canvas.getAttribute('data-vrm-filename')).toBe('default-avatar.vrm');
        expect(['true', 'false']).toContain(await canvas.getAttribute('data-vrm-humanoid'));
      }
      // The bundled default-avatar.vrm is now a real humanoid VRM (generated by
      // scripts/generate-default-vrm.mjs), so it loads as 'loaded' rather than
      // the old degenerate-stub 'fallback'. The dedicated humanoid assertion
      // below ('default avatar loads as a real humanoid VRM') pins that outcome.

      await electronApp.close();
    } finally {
      // On Windows the SQLite db file can remain briefly locked after the
      // Electron process exits — don't let temp cleanup fail the assertions.
      try {
        fs.rmSync(tmpUserData, { recursive: true, force: true });
      } catch {
        /* temp dir is reclaimed by the OS; ignore lock races */
      }
    }
  });

  test('should auto-seed default VRM on fresh startup with empty avatars directory', async () => {
    // Use an isolated userData dir so no pre-existing avatars exist
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-test-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // avatar:list-available should return at least the seeded default VRM
      const avatars = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });

      expect(Array.isArray(avatars)).toBe(true);
      expect((avatars as unknown[]).length).toBeGreaterThan(0);
      expect((avatars as Array<{ filename: string }>)[0].filename).toBe('default-avatar.vrm');

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  test('default avatar loads as a real humanoid VRM (not the ghost fallback)', async () => {
    // Fresh userData so the bundled default-avatar.vrm is auto-seeded and loaded.
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-test-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Skip the first-launch wizard so the default chat view (which hosts the
      // avatar canvas) renders. The bundled default avatar was already seeded
      // into userData at app startup, independent of setup state.
      await window.evaluate(async () => {
        await (window as unknown as { aris: { invoke: (c: string) => Promise<unknown> } }).aris.invoke(
          'setup:mark-complete',
        );
      });
      await window.reload();
      await window.waitForLoadState('domcontentloaded');

      // Wait for the VRM to finish loading, then assert it loaded for real and is
      // humanoid — proving the bundled asset is a usable humanoid VRM, not the
      // degenerate stub that forced the procedural ghost fallback.
      const canvas = window.locator('[data-testid="camera-viewer-canvas"]');
      await expect(canvas).toHaveAttribute('data-vrm-status', 'loaded', { timeout: 20000 });
      await expect(canvas).toHaveAttribute('data-vrm-humanoid', 'true');

      await electronApp.close();
    } finally {
      // Best-effort temp cleanup: on Windows the embedded DB file can stay
      // briefly locked after the Electron process exits, which would otherwise
      // surface as a spurious EBUSY failure unrelated to the avatar assertions.
      try {
        fs.rmSync(tmpUserData, { recursive: true, force: true });
      } catch {
        /* leaked temp dir is harmless — OS will reclaim it */
      }
    }
  });
});
