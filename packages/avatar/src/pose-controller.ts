import type { VRM } from '@pixiv/three-vrm';

export type PoseType =
  | 'standing'
  | 'relaxed'
  | 'arms-crossed'
  | 'hands-on-hips'
  | 'hand-on-chin'
  | 'leaning'
  | 'sitting';

interface BoneTarget {
  bone: string;
  axis: 'x' | 'y' | 'z';
  value: number;
}

/** Additive bone-rotation offsets that define each held pose. */
const POSE_TARGETS: Record<PoseType, BoneTarget[]> = {
  standing: [],

  relaxed: [
    { bone: 'spine', axis: 'x', value: 0.03 },
    { bone: 'leftLowerArm', axis: 'z', value: 0.08 },
    { bone: 'rightLowerArm', axis: 'z', value: -0.08 },
  ],

  'arms-crossed': [
    { bone: 'leftUpperArm', axis: 'z', value: 0.65 },
    { bone: 'leftUpperArm', axis: 'x', value: -0.45 },
    { bone: 'rightUpperArm', axis: 'z', value: -0.65 },
    { bone: 'rightUpperArm', axis: 'x', value: -0.45 },
    { bone: 'leftLowerArm', axis: 'y', value: 0.3 },
    { bone: 'rightLowerArm', axis: 'y', value: -0.3 },
  ],

  'hands-on-hips': [
    { bone: 'leftUpperArm', axis: 'z', value: 0.6 },
    { bone: 'leftUpperArm', axis: 'x', value: 0.3 },
    { bone: 'rightUpperArm', axis: 'z', value: -0.6 },
    { bone: 'rightUpperArm', axis: 'x', value: 0.3 },
    { bone: 'leftLowerArm', axis: 'y', value: 0.7 },
    { bone: 'rightLowerArm', axis: 'y', value: -0.7 },
  ],

  'hand-on-chin': [
    { bone: 'rightUpperArm', axis: 'z', value: -0.55 },
    { bone: 'rightUpperArm', axis: 'x', value: 0.3 },
    { bone: 'rightLowerArm', axis: 'y', value: -0.7 },
    { bone: 'head', axis: 'y', value: 0.08 },
  ],

  leaning: [
    { bone: 'hips', axis: 'x', value: 0.05 },
    { bone: 'hips', axis: 'z', value: 0.05 },
    { bone: 'spine', axis: 'z', value: -0.03 },
  ],

  sitting: [
    { bone: 'hips', axis: 'x', value: 0.08 },
    { bone: 'spine', axis: 'x', value: -0.05 },
    { bone: 'chest', axis: 'x', value: -0.03 },
  ],
};

/** Lerp speed: ~95% convergence toward target in ~1 second. */
const LERP_SPEED = 3.0;

/**
 * PoseController manages persistent held body poses.
 *
 * Poses are distinct from gestures:
 * - Gestures are one-shot timed animations (reset to zero when done).
 * - Poses are held states that blend in over ~1 second and stay until changed.
 *
 * Frame loop order (within humanoid pipeline):
 *   resetBones → basePose.apply() → poseController.update() → idle.update() → ...
 *
 * All offsets are additive (+=), so idle breathing, sway, and gestures
 * continue to layer naturally on top of the held pose.
 */
export class PoseController {
  private vrm: VRM | null = null;
  private currentPose: PoseType = 'standing';

  /** Interpolated additive offsets keyed by "bone.axis". */
  private currentOffsets = new Map<string, number>();
  /** Target additive offsets for the active pose. */
  private targetOffsets = new Map<string, number>();

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.currentOffsets.clear();
    this.targetOffsets.clear();
    this.currentPose = 'standing';
  }

  setPose(pose: PoseType): void {
    if (pose === this.currentPose) return;
    this.currentPose = pose;

    // Build the new target map — any bone not in the new pose targets 0 (blends out).
    const nextTargets = new Map<string, number>();
    for (const bt of POSE_TARGETS[pose]) {
      nextTargets.set(`${bt.bone}.${bt.axis}`, bt.value);
    }

    // Preserve existing keys so they smoothly return to 0.
    for (const key of this.currentOffsets.keys()) {
      if (!nextTargets.has(key)) nextTargets.set(key, 0);
    }
    for (const key of this.targetOffsets.keys()) {
      if (!nextTargets.has(key)) nextTargets.set(key, 0);
    }

    this.targetOffsets = nextTargets;
  }

  getCurrentPose(): PoseType {
    return this.currentPose;
  }

  /**
   * Call once per frame, after basePose.apply() and before idle.update().
   * Lerps all tracked offsets toward their targets, then applies them additively.
   */
  update(delta: number): void {
    if (!this.vrm) return;

    const lerpFactor = Math.min(LERP_SPEED * delta, 1.0);

    // Merge target keys into current (initialise new keys at 0)
    for (const key of this.targetOffsets.keys()) {
      if (!this.currentOffsets.has(key)) this.currentOffsets.set(key, 0);
    }

    // Lerp and apply
    for (const [key, current] of this.currentOffsets) {
      const target = this.targetOffsets.get(key) ?? 0;
      const next = current + (target - current) * lerpFactor;
      this.currentOffsets.set(key, next);

      if (Math.abs(next) < 1e-5 && Math.abs(target) < 1e-5) {
        // Fully settled at zero — remove from map to avoid unbounded growth
        this.currentOffsets.delete(key);
        this.targetOffsets.delete(key);
        continue;
      }

      // Parse bone name and axis from key ("boneName.x")
      const dot = key.lastIndexOf('.');
      const boneName = key.slice(0, dot);
      const axis = key.slice(dot + 1) as 'x' | 'y' | 'z';

      const bone = this.vrm.humanoid?.getNormalizedBoneNode(boneName as any);
      if (bone) {
        bone.rotation[axis] += next;
      }
    }
  }
}

/** Maps assistant message sentiment to a body pose. */
export function sentimentToPose(text: string): PoseType {
  const lower = text.toLowerCase();

  if (/\b(hmm|think|consider|maybe|perhaps|wonder|ponder|curious|let me)\b/.test(lower)) {
    return 'hand-on-chin';
  }
  if (/\b(confident|sure|absolutely|definitely|certain|ready|strong|exactly)\b/.test(lower)) {
    return 'hands-on-hips';
  }
  if (/\b(relax|chill|casual|easy|fine|okay|alright|no worries)\b/.test(lower)) {
    return 'relaxed';
  }

  return 'standing';
}
