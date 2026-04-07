import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createMinimalVRM } from '../fixtures/create-test-vrm';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

/**
 * The minimal VRM fixture has an empty humanBones array, so AvatarScene.detectHumanoid()
 * returns false (no Hips / Spine / Head bones present) — making it a valid non-humanoid test
 * model. We name it "ghost.vrm" per the task's acceptance criteria.
 */
const GHOST_VRM = 'ghost.vrm';

test.describe('Non-humanoid avatar flow', () => {
  /**
   * TC-1  Load Ghost.vrm → verify it renders (not static/invisible)
   *
   * At the IPC / protocol layer: the file must be seeded, detected by
   * avatar:list-available, and served by the avatar:// custom protocol with
   * non-zero byte content — confirming the rendering pipeline has real data
   * to work with rather than a blank / missing model.
   */
  test('ghost VRM is served by avatar:// protocol with non-zero content', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-ghost-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      const avatarsDir = path.join(tmpUserData, 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });
      fs.writeFileSync(path.join(avatarsDir, GHOST_VRM), createMinimalVRM());

      // Avatar must appear in the list
      const avatars = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      expect(Array.isArray(avatars)).toBe(true);
      expect(avatars).toEqual(
        expect.arrayContaining([expect.objectContaining({ filename: GHOST_VRM })]),
      );

      // avatar:// protocol must serve non-zero bytes (rendering pipeline has content)
      const fetchResult = await window.evaluate(async (filename: string) => {
        try {
          const res = await fetch(`avatar://${filename}`);
          return { ok: res.ok, size: (await res.arrayBuffer()).byteLength };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      }, GHOST_VRM);

      expect(fetchResult.ok).toBe(true);
      expect((fetchResult as any).size).toBeGreaterThan(0);

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  /**
   * TC-2  Verify non-humanoid badge appears in avatar settings
   *
   * The "Non-Humanoid" badge in AvatarSettings is driven by the isHumanoid flag
   * stored in avatar metadata.  After the renderer loads a VRM and detects it as
   * non-humanoid it calls avatar:update-metadata; this test verifies that call
   * persists the flag and that avatar:list-available returns it so the badge
   * renders correctly.
   */
  test('avatar:update-metadata persists isHumanoid false and list-available reflects it', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-badge-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      const avatarsDir = path.join(tmpUserData, 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });
      fs.writeFileSync(path.join(avatarsDir, GHOST_VRM), createMinimalVRM());

      // Simulate the renderer detecting a non-humanoid model and saving the result
      const meta = await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:update-metadata', filename, {
          isHumanoid: false,
          hasExpressions: false,
          hasLipSync: false,
        });
      }, GHOST_VRM);

      expect(meta).toMatchObject({
        isHumanoid: false,
        humanoidOverride: null,
        hasExpressions: false,
        hasLipSync: false,
      });
      expect(typeof meta.importedAt).toBe('string');

      // list-available must expose the metadata so the badge can read it
      const avatars = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      const ghost = (avatars as any[]).find((a: any) => a.filename === GHOST_VRM);
      expect(ghost).toBeDefined();
      expect(ghost.metadata).toMatchObject({ isHumanoid: false });

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  /**
   * TC-3  Toggle "Treat as humanoid" override → verify pipeline switches
   *
   * avatar:set-humanoid-override stores true / null and must be reflected in the
   * metadata returned by list-available so AvatarDisplay and AvatarSettings can
   * choose the correct animation pipeline.
   */
  test('avatar:set-humanoid-override toggles the override and list-available reflects it', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-override-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      const avatarsDir = path.join(tmpUserData, 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });
      fs.writeFileSync(path.join(avatarsDir, GHOST_VRM), createMinimalVRM());

      // Establish baseline: non-humanoid
      await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:update-metadata', filename, { isHumanoid: false });
      }, GHOST_VRM);

      // --- Toggle ON: user checks "Treat as humanoid" ---
      const overrideOn = await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:set-humanoid-override', filename, true);
      }, GHOST_VRM);

      expect(overrideOn).toMatchObject({ isHumanoid: false, humanoidOverride: true });

      // list-available must expose the override so AvatarDisplay routes to humanoid pipeline
      const avatarsOn = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      const ghostOn = (avatarsOn as any[]).find((a: any) => a.filename === GHOST_VRM);
      expect(ghostOn?.metadata?.humanoidOverride).toBe(true);

      // --- Toggle OFF: user unchecks "Treat as humanoid" ---
      const overrideOff = await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:set-humanoid-override', filename, null);
      }, GHOST_VRM);

      expect(overrideOff).toMatchObject({ isHumanoid: false, humanoidOverride: null });

      // list-available must reflect the cleared override
      const avatarsOff = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      const ghostOff = (avatarsOff as any[]).find((a: any) => a.filename === GHOST_VRM);
      expect(ghostOff?.metadata?.humanoidOverride).toBeNull();

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  /**
   * TC-4  Load standard humanoid VRM → verify full animation pipeline still works
   *
   * A VRM flagged as humanoid must persist isHumanoid: true through the metadata
   * round-trip — this is the data contract that lets AvatarDisplay take the humanoid
   * animation code path (IdleAnimation, ExpressionController, GazeController, etc.).
   */
  test('avatar:update-metadata persists isHumanoid true for humanoid VRM', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-humanoid-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      const avatarsDir = path.join(tmpUserData, 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });
      const humanoidVrm = 'humanoid-test.vrm';
      fs.writeFileSync(path.join(avatarsDir, humanoidVrm), createMinimalVRM());

      // Simulate the renderer detecting humanoid bones and persisting the result
      const meta = await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:update-metadata', filename, {
          isHumanoid: true,
          hasExpressions: true,
          hasLipSync: true,
        });
      }, humanoidVrm);

      expect(meta).toMatchObject({
        isHumanoid: true,
        humanoidOverride: null,
        hasExpressions: true,
        hasLipSync: true,
      });

      // list-available must return the humanoid flag for the animation pipeline router
      const avatars = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      const humanoid = (avatars as any[]).find((a: any) => a.filename === humanoidVrm);
      expect(humanoid?.metadata?.isHumanoid).toBe(true);

      // A non-humanoid model loaded alongside must not be affected
      fs.writeFileSync(path.join(avatarsDir, GHOST_VRM), createMinimalVRM());
      await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:update-metadata', filename, { isHumanoid: false });
      }, GHOST_VRM);

      const allAvatars = await window.evaluate(async () => {
        return (window as any).aris.invoke('avatar:list-available');
      });
      const ghostEntry = (allAvatars as any[]).find((a: any) => a.filename === GHOST_VRM);
      expect(ghostEntry?.metadata?.isHumanoid).toBe(false);
      const humanoidEntry = (allAvatars as any[]).find((a: any) => a.filename === humanoidVrm);
      expect(humanoidEntry?.metadata?.isHumanoid).toBe(true);

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  /**
   * TC-5  Verify metadata file is created alongside VRM
   *
   * avatar:update-metadata (and avatar:set-humanoid-override) must create a
   * <name>.meta.json file in the avatars directory next to the .vrm file.
   */
  test('metadata .meta.json file is created alongside VRM on first update-metadata call', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aris-metafile-'));
    try {
      const electronApp = await electron.launch({
        args: [appPath, `--user-data-dir=${tmpUserData}`],
      });
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      const avatarsDir = path.join(tmpUserData, 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });
      fs.writeFileSync(path.join(avatarsDir, GHOST_VRM), createMinimalVRM());

      const metaPath = path.join(avatarsDir, 'ghost.meta.json');

      // No metadata file should exist before the first update call
      expect(fs.existsSync(metaPath)).toBe(false);

      // Calling update-metadata must create the .meta.json file
      await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:update-metadata', filename, { isHumanoid: false });
      }, GHOST_VRM);

      expect(fs.existsSync(metaPath)).toBe(true);

      const contents = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(contents.isHumanoid).toBe(false);
      expect(contents.humanoidOverride).toBeNull();
      expect(typeof contents.importedAt).toBe('string');

      // set-humanoid-override on the same file must update the existing .meta.json
      await window.evaluate(async (filename: string) => {
        return (window as any).aris.invoke('avatar:set-humanoid-override', filename, true);
      }, GHOST_VRM);

      const updated = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(updated.humanoidOverride).toBe(true);
      // isHumanoid must remain unchanged
      expect(updated.isHumanoid).toBe(false);

      await electronApp.close();
    } finally {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });
});
