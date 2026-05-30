import { test, expect } from '@playwright/test';
import { launchAris, type LaunchArisResult } from './helpers/launch-aris';
import { waitForVRMLoaded } from './helpers/wait-for-vrm';
import { createHumanoidVRM } from '../fixtures/create-test-vrm';

const HUMANOID_VRM = 'humanoid-test.vrm';

interface Euler {
  x: number;
  y: number;
  z: number;
}

// Electron cold-launch + reload is heavy in CI/sandbox, so launch once and
// share the window: both checks are read-only against the same loaded avatar.
test.describe('Humanoid VRM animation pipeline', () => {
  test.describe.configure({ timeout: 120_000 });

  let session: LaunchArisResult;

  test.beforeAll(async () => {
    session = await launchAris({
      avatars: { [HUMANOID_VRM]: createHumanoidVRM() },
      defaultAvatar: HUMANOID_VRM,
    });
    // Settle on a terminal humanoid load before the assertions run.
    await waitForVRMLoaded(session.window, { requireHumanoid: true });
  });

  test.afterAll(async () => {
    await session?.close();
  });

  test('loads the humanoid fixture as a real humanoid VRM (not fallback)', async () => {
    const { window } = session;
    const canvas = window.locator('[data-testid="camera-viewer-canvas"]');

    expect(await canvas.getAttribute('data-vrm-status')).toBe('loaded');
    expect(await canvas.getAttribute('data-vrm-humanoid')).toBe('true');
    expect(await canvas.getAttribute('data-vrm-filename')).toBe(HUMANOID_VRM);

    // The read-only test inspector must agree with the DOM signal.
    const inspected = await window.evaluate(
      () => (window as unknown as { __arisE2E?: { getVrmStatus: () => unknown } }).__arisE2E?.getVrmStatus(),
    );
    expect(inspected).toMatchObject({ status: 'loaded', humanoid: true, filename: HUMANOID_VRM });

    // Core humanoid bone must be resolvable through the normalized rig.
    const headPresent = await window.evaluate(
      () =>
        (window as unknown as { __arisE2E?: { getBoneEuler: (b: string) => Euler | null } }).__arisE2E?.getBoneEuler(
          'head',
        ) !== null,
    );
    expect(headPresent).toBe(true);
  });

  test('idle/gaze actually tick — head/spine/neck bone Euler changes over time', async () => {
    const { window } = session;

    // Sample the animated bones across animation frames in the renderer.
    const samples = await window.evaluate(async () => {
      const e2e = (
        window as unknown as { __arisE2E?: { getBoneEuler: (b: string) => Euler | null } }
      ).__arisE2E;
      if (!e2e) return [];
      const read = () => ({
        head: e2e.getBoneEuler('head'),
        spine: e2e.getBoneEuler('spine'),
        neck: e2e.getBoneEuler('neck'),
      });
      const out: ReturnType<typeof read>[] = [];
      for (let i = 0; i < 60; i++) {
        out.push(read());
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
      return out;
    });

    expect(samples.length).toBeGreaterThan(10);

    // Spread of a single bone axis across all samples.
    const spread = (bone: 'head' | 'spine' | 'neck', axis: keyof Euler): number => {
      const vals = samples
        .map((s) => s[bone]?.[axis])
        .filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return 0;
      return Math.max(...vals) - Math.min(...vals);
    };

    // At least one tracked bone axis must move well beyond float noise,
    // proving the idle (spine/neck breathing+sway) and gaze (head drift)
    // controllers are running per-frame — directly answering "are the
    // animations + eye behaviour actually ticking?".
    const totalMotion =
      spread('head', 'y') +
      spread('head', 'x') +
      spread('spine', 'x') +
      spread('neck', 'y') +
      spread('neck', 'z');

    expect(totalMotion).toBeGreaterThan(1e-4);
  });
});
