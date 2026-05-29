import type { VRM } from '@pixiv/three-vrm';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Per-axis target rotation (radians) measured FROM T-pose. These values
 * describe the natural standing pose we want every avatar to land in.
 * Right-side targets mirror left-side via sign flips on the same axis.
 */
type AxisOffset = { x?: number; y?: number; z?: number };

const BONE_TARGETS: Partial<Record<VRMHumanBoneName, AxisOffset>> = {
  [VRMHumanBoneName.LeftUpperArm]:  { z:  1.2 },
  [VRMHumanBoneName.RightUpperArm]: { z: -1.2 },
  [VRMHumanBoneName.LeftLowerArm]:  { y:  0.25 },
  [VRMHumanBoneName.RightLowerArm]: { y: -0.25 },
  [VRMHumanBoneName.LeftHand]:      { z:  0.1 },
  [VRMHumanBoneName.RightHand]:     { z: -0.1 },
  [VRMHumanBoneName.LeftShoulder]:  { y: -0.05 },
  [VRMHumanBoneName.RightShoulder]: { y:  0.05 },
};

/**
 * Compute the additive delta needed to land at `target` starting from `rest`.
 * Only adds rotation in the same direction as the target — if the model's
 * rest pose has already met or exceeded the target on this axis, returns 0
 * so we never bend the model AWAY from artist intent.
 */
export function adaptiveOffset(target: number, rest: number): number {
  if (target > 0) return Math.max(0, target - rest);
  if (target < 0) return Math.min(0, target - rest);
  return 0;
}

/**
 * BasePose lays down a natural standing pose on top of the VRM rest pose.
 * Apply() runs each frame after resetBones() and before idle animations.
 *
 * Per-bone offsets are computed once per VRM at setVRM() time, derived
 * from each bone's actual rest rotation. Models authored in T-pose receive
 * the full default offsets; models already in A-pose or relaxed stances
 * receive proportionally smaller offsets, so they never get over-rotated
 * (which previously wrapped arms behind the back and broke downstream
 * reaction animations like the annoyed arms-cross).
 */
export class BasePose {
  private vrm: VRM | null = null;
  private offsets: Map<VRMHumanBoneName, AxisOffset> = new Map();

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.offsets.clear();

    for (const [boneName, target] of Object.entries(BONE_TARGETS)) {
      const name = boneName as VRMHumanBoneName;
      const node = vrm.humanoid?.getRawBoneNode(name);
      if (!node || !target) continue;

      // node.rotation at setVRM time is the model's authored rest pose —
      // no controllers have run yet, so this is safe to read directly.
      const offset: AxisOffset = {};
      if (target.x !== undefined) offset.x = adaptiveOffset(target.x, node.rotation.x);
      if (target.y !== undefined) offset.y = adaptiveOffset(target.y, node.rotation.y);
      if (target.z !== undefined) offset.z = adaptiveOffset(target.z, node.rotation.z);
      this.offsets.set(name, offset);
    }
  }

  apply(): void {
    const vrm = this.vrm;
    if (!vrm) return;

    for (const [name, offset] of this.offsets) {
      const node = vrm.humanoid?.getRawBoneNode(name);
      if (!node) continue;
      if (offset.x) node.rotation.x += offset.x;
      if (offset.y) node.rotation.y += offset.y;
      if (offset.z) node.rotation.z += offset.z;
    }
  }
}
