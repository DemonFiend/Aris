import { describe, it, expect } from 'vitest';
import { IdleAnimation } from './idle-animation';

type Vec3Stub = {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): void;
};
type StubBone = { position: Vec3Stub; rotation: Vec3Stub };

function makeVec3(): Vec3Stub {
  const v: Vec3Stub = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      v.x = x;
      v.y = y;
      v.z = z;
    },
  };
  return v;
}

function makeStubVRM(boneNames: string[]) {
  const bones = new Map<string, StubBone>();
  for (const name of boneNames) {
    bones.set(name, { position: makeVec3(), rotation: makeVec3() });
  }
  return {
    bones,
    vrm: {
      humanoid: {
        getNormalizedBoneNode: (name: string) => bones.get(name) ?? null,
      },
      expressionManager: null,
    } as unknown as Parameters<IdleAnimation['setVRM']>[0],
  };
}

describe('IdleAnimation.resetBones', () => {
  it('resets the eye bones to rest each frame so gaze writes do not accumulate', () => {
    // Regression for ARI-244: eye bones were missing from the reset list, so
    // GazeController's additive (`+=`) eye writes accumulated and saturated
    // against its clamp — pinning the pupils out of view.
    const stub = makeStubVRM(['head', 'neck', 'hips', 'leftEye', 'rightEye']);
    const idle = new IdleAnimation();
    idle.setVRM(stub.vrm);

    const leftEye = stub.bones.get('leftEye')!;
    const rightEye = stub.bones.get('rightEye')!;

    // Simulate a downstream controller (gaze) having rotated the eyes last frame.
    leftEye.rotation.x = 0.2;
    leftEye.rotation.y = 0.22;
    rightEye.rotation.x = -0.15;
    rightEye.rotation.y = 0.22;

    idle.resetBones();

    expect(leftEye.rotation.x).toBe(0);
    expect(leftEye.rotation.y).toBe(0);
    expect(rightEye.rotation.x).toBe(0);
    expect(rightEye.rotation.y).toBe(0);
  });

  it('tolerates VRMs without eye bones', () => {
    const stub = makeStubVRM(['head', 'neck', 'hips']);
    const idle = new IdleAnimation();
    idle.setVRM(stub.vrm);
    expect(() => idle.resetBones()).not.toThrow();
  });
});
