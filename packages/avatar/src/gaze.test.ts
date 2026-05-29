import { describe, it, expect, beforeEach } from 'vitest';
import { GazeController } from './gaze';

type StubBone = { rotation: { x: number; y: number; z: number } };

function makeStubVRM() {
  const bones = new Map<string, StubBone>();
  const ensure = (name: string): StubBone => {
    let b = bones.get(name);
    if (!b) {
      b = { rotation: { x: 0, y: 0, z: 0 } };
      bones.set(name, b);
    }
    return b;
  };
  return {
    bones,
    vrm: {
      humanoid: {
        getNormalizedBoneNode: (name: string) => ensure(name),
      },
    } as unknown as Parameters<GazeController['setVRM']>[0],
  };
}

describe('GazeController', () => {
  let stub: ReturnType<typeof makeStubVRM>;
  let ctrl: GazeController;

  beforeEach(() => {
    stub = makeStubVRM();
    ctrl = new GazeController();
    ctrl.setVRM(stub.vrm);
    // Force speaking mode so head/eye targets stay near zero — isolates the
    // mouse-driven contribution we care about for these tests.
    ctrl.setMode('speaking');
  });

  /**
   * Mimic the real frame loop: idle.resetBones() zeroes bones each frame
   * before gaze.update runs additively. Without this, bone rotations
   * accumulate forever in the test harness.
   */
  function tickFrame(delta: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      for (const bone of stub.bones.values()) {
        bone.rotation.x = 0;
        bone.rotation.y = 0;
        bone.rotation.z = 0;
      }
      ctrl.update(delta);
    }
  }

  it('drifts mouse offset back toward zero after inactivity threshold', () => {
    // Establish a fresh mouse position at top-right corner.
    // Refresh setMousePosition each frame to mimic continuous mousemove.
    for (let i = 0; i < 30; i++) {
      ctrl.setMousePosition(1, 0);
      tickFrame(1 / 60);
    }
    const eye = stub.vrm.humanoid!.getNormalizedBoneNode!('leftEye')!;
    const peakYaw = eye.rotation.y;
    expect(Math.abs(peakYaw)).toBeGreaterThan(0.01);

    // Stop sending mouse updates — wait past inactivity threshold (0.5s)
    // so the decay path drags eye rotation back toward zero.
    tickFrame(1 / 60, 120);
    const finalEye = stub.vrm.humanoid!.getNormalizedBoneNode!('leftEye')!;
    expect(Math.abs(finalEye.rotation.y)).toBeLessThan(Math.abs(peakYaw) * 0.2);
  });

  it('clearMousePosition makes eyes drift back immediately', () => {
    for (let i = 0; i < 30; i++) {
      ctrl.setMousePosition(1, 1);
      tickFrame(1 / 60);
    }
    ctrl.clearMousePosition();
    tickFrame(1 / 60, 60);
    const eye = stub.vrm.humanoid!.getNormalizedBoneNode!('leftEye')!;
    expect(Math.abs(eye.rotation.x)).toBeLessThan(0.05);
    expect(Math.abs(eye.rotation.y)).toBeLessThan(0.05);
  });

  it('caps eye rotation when an upstream writer sets a large value', () => {
    const eye = stub.vrm.humanoid!.getNormalizedBoneNode!('leftEye')!;
    // Simulate vrm.lookAt or an expression rotating the eye bone past safe range
    // BEFORE gaze.update runs (i.e., after resetBones, before our additive write).
    for (const bone of stub.bones.values()) {
      bone.rotation.x = 0;
      bone.rotation.y = 0;
      bone.rotation.z = 0;
    }
    eye.rotation.x = 2.0;
    eye.rotation.y = 2.0;
    ctrl.update(1 / 60);
    expect(Math.abs(eye.rotation.x)).toBeLessThanOrEqual(0.35 + 1e-6);
    expect(Math.abs(eye.rotation.y)).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('suppression pulls eyes to neutral regardless of mouse position', () => {
    for (let i = 0; i < 30; i++) {
      ctrl.setMousePosition(1, 1);
      tickFrame(1 / 60);
    }
    ctrl.setSuppressed(true);
    // Keep refreshing mouse so we prove suppression overrides the target.
    for (let i = 0; i < 60; i++) {
      ctrl.setMousePosition(1, 1);
      tickFrame(1 / 60);
    }
    const eye = stub.vrm.humanoid!.getNormalizedBoneNode!('leftEye')!;
    expect(Math.abs(eye.rotation.x)).toBeLessThan(0.02);
    expect(Math.abs(eye.rotation.y)).toBeLessThan(0.02);
  });
});
