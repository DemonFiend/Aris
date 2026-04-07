import type { VRM } from '@pixiv/three-vrm';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * BasePose applies a natural standing pose on top of the VRM rest pose.
 * Call apply() each frame after resetBones() and before idle animations.
 * All adjustments are additive (+=) so idle and gesture layers compose on top.
 */
export class BasePose {
  private vrm: VRM | null = null;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  apply(): void {
    const vrm = this.vrm;
    if (!vrm) return;

    const humanoid = vrm.humanoid;

    // Bring arms down from T-Pose horizontal to natural resting position
    const leftUpperArm = humanoid.getRawBoneNode(VRMHumanBoneName.LeftUpperArm);
    if (leftUpperArm) leftUpperArm.rotation.z += 1.2;

    const rightUpperArm = humanoid.getRawBoneNode(VRMHumanBoneName.RightUpperArm);
    if (rightUpperArm) rightUpperArm.rotation.z -= 1.2;

    // Slight elbow bend — prevents stiff straight-arm look
    const leftLowerArm = humanoid.getRawBoneNode(VRMHumanBoneName.LeftLowerArm);
    if (leftLowerArm) leftLowerArm.rotation.y += 0.25;

    const rightLowerArm = humanoid.getRawBoneNode(VRMHumanBoneName.RightLowerArm);
    if (rightLowerArm) rightLowerArm.rotation.y -= 0.25;

    // Relaxed wrists — gentle inward curl
    const leftHand = humanoid.getRawBoneNode(VRMHumanBoneName.LeftHand);
    if (leftHand) leftHand.rotation.z += 0.1;

    const rightHand = humanoid.getRawBoneNode(VRMHumanBoneName.RightHand);
    if (rightHand) rightHand.rotation.z -= 0.1;

    // Shoulders slightly forward — relaxed natural posture
    const leftShoulder = humanoid.getRawBoneNode(VRMHumanBoneName.LeftShoulder);
    if (leftShoulder) leftShoulder.rotation.y -= 0.05;

    const rightShoulder = humanoid.getRawBoneNode(VRMHumanBoneName.RightShoulder);
    if (rightShoulder) rightShoulder.rotation.y += 0.05;
  }
}
