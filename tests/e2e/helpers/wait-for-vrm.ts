import type { Page } from '@playwright/test';

export interface WaitForVRMOptions {
  /** Also require data-vrm-humanoid="true" (i.e. the humanoid pipeline mounted). */
  requireHumanoid?: boolean;
  timeout?: number;
}

export interface VRMLoadState {
  status: string | null;
  humanoid: string | null;
  filename: string | null;
}

/**
 * Wait until the AvatarDisplay canvas reaches a terminal VRM load state by
 * polling the `data-vrm-status` attribute the renderer exposes for
 * observability (`loaded` | `fallback` | `error` — never stuck on `loading`).
 *
 * When `requireHumanoid` is set, waits specifically for a loaded humanoid VRM
 * (`data-vrm-status="loaded"` and `data-vrm-humanoid="true"`), which is the
 * precondition for the bone-animation stack to run.
 */
export async function waitForVRMLoaded(
  window: Page,
  { requireHumanoid = false, timeout = 20_000 }: WaitForVRMOptions = {},
): Promise<VRMLoadState> {
  const canvas = window.locator('[data-testid="camera-viewer-canvas"]');
  await canvas.waitFor({ state: 'attached', timeout });

  await window.waitForFunction(
    (needHumanoid) => {
      const el = document.querySelector('[data-testid="camera-viewer-canvas"]');
      if (!el) return false;
      const status = el.getAttribute('data-vrm-status');
      const terminal = status === 'loaded' || status === 'fallback' || status === 'error';
      if (!terminal) return false;
      if (needHumanoid) {
        return status === 'loaded' && el.getAttribute('data-vrm-humanoid') === 'true';
      }
      return true;
    },
    requireHumanoid,
    { timeout },
  );

  return {
    status: await canvas.getAttribute('data-vrm-status'),
    humanoid: await canvas.getAttribute('data-vrm-humanoid'),
    filename: await canvas.getAttribute('data-vrm-filename'),
  };
}
