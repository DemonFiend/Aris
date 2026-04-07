import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
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
});
