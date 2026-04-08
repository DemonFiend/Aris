import type { VRM } from '@pixiv/three-vrm';
import type { IdleProfile } from '@aris/shared';

/**
 * Idle animation controller that adds subtle life to the avatar:
 * - Breathing (slight head bob)
 * - Blinking at random intervals
 * - Subtle head sway
 * - Body-level motions: hip sway, torso rock, arm drift, shoulder settle
 *
 * Owns the bone-reset lifecycle: call resetBones() at the start of each
 * frame before any controller runs, so every controller can safely use
 * additive (`+=`) offsets without cross-frame accumulation.
 */
export interface IdleConfig {
  enabled: boolean;
  breathingIntensity: number;
  swayIntensity: number;
  blinkFrequency: number;
  bodyIntensity: number; // 0-1, scales full-body idle motions
}

/** All bones that any animation controller may modify. */
const ANIMATED_BONES = [
  'head', 'neck', 'hips', 'spine', 'chest',
  'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm',
  'leftHand', 'rightHand',
  'leftShoulder', 'rightShoulder',
] as const;

interface Vec3 { x: number; y: number; z: number }

export class IdleAnimation {
  private vrm: VRM | null = null;
  private time = 0;
  private blinkTimer = 0;
  private blinkDuration = 0.15;
  private nextBlink = 3;
  private isBlinking = false;
  private basePositions = new Map<string, Vec3>();
  private baseRotations = new Map<string, Vec3>();
  private config: IdleConfig = {
    enabled: true,
    breathingIntensity: 1,
    swayIntensity: 1,
    blinkFrequency: 4,
    bodyIntensity: 1,
  };

  // Personality-driven profile multipliers
  private profile: IdleProfile = {
    breathingMultiplier: 1.0,
    swayMultiplier: 1.0,
    blinkFrequencyMultiplier: 1.0,
    bodyMultiplier: 1.0,
    variationFrequencyMultiplier: 1.0,
    fidgetProbability: 0.4,
  };

  // 2B: Weight shift state
  private weightShiftTimer = 8;
  private weightShiftTarget = 0;   // -1 = left, 0 = center, +1 = right
  private weightShiftCurrent = 0;  // smoothly interpolated

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    // Capture rest-pose transforms for every bone any controller may touch
    for (const name of ANIMATED_BONES) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name);
      if (bone) {
        this.basePositions.set(name, { x: bone.position.x, y: bone.position.y, z: bone.position.z });
        this.baseRotations.set(name, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z });
      }
    }
  }

  setConfig(config: Partial<IdleConfig>): void {
    Object.assign(this.config, config);
  }

  setIdleProfile(profile: IdleProfile): void {
    this.profile = profile;
  }

  /**
   * Reset every animated bone to its rest-pose transform.
   * MUST be called once at the start of each frame, before any controller
   * runs, so additive (`+=`) offsets never accumulate across frames.
   */
  resetBones(): void {
    if (!this.vrm) return;
    for (const name of ANIMATED_BONES) {
      const bone = this.vrm.humanoid?.getNormalizedBoneNode(name);
      if (!bone) continue;
      const bp = this.basePositions.get(name);
      const br = this.baseRotations.get(name);
      if (bp) bone.position.set(bp.x, bp.y, bp.z);
      if (br) bone.rotation.set(br.x, br.y, br.z);
    }
  }

  update(delta: number): void {
    if (!this.vrm || !this.config.enabled) return;

    this.time += delta;

    // Breathing — gentle head bob (additive on reset base), scaled by profile
    const breathScale = this.config.breathingIntensity * this.profile.breathingMultiplier;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.position.y += Math.sin(this.time * 1.5) * 0.003 * breathScale;
    }

    // Subtle head sway, scaled by profile
    const swayScale = this.config.swayIntensity * this.profile.swayMultiplier;
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.y += Math.sin(this.time * 0.3) * 0.02 * swayScale;
      neck.rotation.z += Math.sin(this.time * 0.5) * 0.01 * swayScale;
    }

    // 2B: Update weight shift state each frame
    this.updateWeightShift(delta);

    // Body-level idle motions (scaled by bodyIntensity)
    this.updateBody();

    // Blinking
    this.updateBlink(delta);
  }

  /** 2B: Periodic weight shift — smoothly interpolates toward a left/center/right target. */
  private updateWeightShift(delta: number): void {
    this.weightShiftTimer -= delta;
    if (this.weightShiftTimer <= 0) {
      // Alternate: shifted → center → shifted (opposite side)
      if (this.weightShiftTarget === 0) {
        this.weightShiftTarget = Math.random() > 0.5 ? 1 : -1;
      } else {
        this.weightShiftTarget = 0;
      }
      this.weightShiftTimer = 8 + Math.random() * 7; // 8-15 s
    }
    // Exponential-decay lerp — reaches ~95% of target in ~1.5 s
    const factor = Math.min(2.0 * delta, 1.0);
    this.weightShiftCurrent += (this.weightShiftTarget - this.weightShiftCurrent) * factor;
  }

  private updateBody(): void {
    if (!this.vrm) return;
    const bi = this.config.bodyIntensity * this.profile.bodyMultiplier;
    if (bi <= 0) return;

    const t = this.time;
    const ws = this.weightShiftCurrent;

    // 2A: Hip sway — composite curve (distinct frequencies, no single-sine pattern)
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (hips) {
      const hipRot =
        Math.sin(t * 0.18) * 0.012 +
        Math.sin(t * 0.43) * 0.005 +
        Math.sin(t * 0.07) * 0.008 +
        Math.sin(t * 2.1)  * 0.001; // micro muscle tension
      hips.rotation.z += hipRot * bi;
      hips.position.x += (Math.sin(t * 0.18) * 0.0015 + Math.sin(t * 0.43) * 0.0006) * bi;
      // 2B: Weight shift overlaid on hips
      hips.rotation.z += ws * 0.020 * bi;
      hips.position.x += ws * 0.003 * bi;
    }

    // 2A: Torso rock — breathing-linked, distinct from hip frequencies
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.x +=
        (Math.sin(t * 0.20) * 0.006 +
         Math.sin(t * 0.51) * 0.003 +
         Math.sin(t * 0.09) * 0.005 +
         Math.sin(t * 1.8)  * 0.001) * bi;
      // 2B: Spine counters weight shift for balance
      spine.rotation.z -= ws * 0.010 * bi;
    }
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      chest.rotation.x +=
        (Math.sin(t * 0.22 + 0.5) * 0.004 +
         Math.sin(t * 0.55 + 0.3) * 0.002 +
         Math.sin(t * 0.11)       * 0.004 +
         Math.sin(t * 1.9)        * 0.001) * bi;
    }

    // 2C: Arm swing counter to hip sway + composite drift
    // Primary hip sway component drives the counter-swing direction
    const hipSwaySign = Math.sin(t * 0.18);
    const leftArm = this.vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (leftArm) {
      leftArm.rotation.z +=
        (Math.sin(t * 0.25 + 1.0) * 0.014 +
         Math.sin(t * 0.63 + 0.5) * 0.006 +
         Math.sin(t * 0.11 + 0.2) * 0.005 -
         hipSwaySign               * 0.009) * bi; // counter hip sway
    }
    if (rightArm) {
      rightArm.rotation.z +=
        (Math.sin(t * 0.25 + 2.0) * -0.014 +
         Math.sin(t * 0.63 + 1.5) * -0.006 +
         Math.sin(t * 0.11 + 1.2) * -0.005 +
         hipSwaySign                *  0.009) * bi; // counter hip sway (opposite side)
    }

    // 2C: Forearm subtle rotation variety
    const leftForearm = this.vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    const rightForearm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
    if (leftForearm) {
      leftForearm.rotation.z +=
        (Math.sin(t * 0.31 + 0.7) * 0.007 +
         Math.sin(t * 0.77 + 0.3) * 0.003) * bi;
    }
    if (rightForearm) {
      rightForearm.rotation.z +=
        (Math.sin(t * 0.31 + 1.8) * -0.007 +
         Math.sin(t * 0.77 + 1.4) * -0.003) * bi;
    }

    // 2A: Shoulder settle — micro-adjustments, opposing phase
    const leftShoulder = this.vrm.humanoid?.getNormalizedBoneNode('leftShoulder');
    const rightShoulder = this.vrm.humanoid?.getNormalizedBoneNode('rightShoulder');
    if (leftShoulder) {
      leftShoulder.rotation.y +=
        (Math.sin(t * 0.15)       * 0.006 +
         Math.sin(t * 0.37)       * 0.003 +
         Math.sin(t * 0.06)       * 0.004 +
         Math.sin(t * 2.5)        * 0.001) * bi;
    }
    if (rightShoulder) {
      rightShoulder.rotation.y +=
        (Math.sin(t * 0.15 + Math.PI) * 0.006 +
         Math.sin(t * 0.37 + Math.PI) * 0.003 +
         Math.sin(t * 0.06 + Math.PI) * 0.004 +
         Math.sin(t * 2.5  + Math.PI) * 0.001) * bi;
    }
  }

  private updateBlink(delta: number): void {
    if (!this.vrm?.expressionManager) return;

    if (this.isBlinking) {
      this.blinkTimer += delta;
      const t = this.blinkTimer / this.blinkDuration;

      if (t < 0.5) {
        // Closing
        this.vrm.expressionManager.setValue('blink', t * 2);
      } else if (t < 1.0) {
        // Opening
        this.vrm.expressionManager.setValue('blink', (1.0 - t) * 2);
      } else {
        // Done
        this.vrm.expressionManager.setValue('blink', 0);
        this.isBlinking = false;
        this.blinkTimer = 0;
        // Blink interval varies around configured frequency, scaled by profile
        const blinkFreq = this.config.blinkFrequency * this.profile.blinkFrequencyMultiplier;
        const half = blinkFreq * 0.5;
        this.nextBlink = blinkFreq - half + Math.random() * half * 2;
      }
    } else {
      this.nextBlink -= delta;
      if (this.nextBlink <= 0) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    }
  }
}
