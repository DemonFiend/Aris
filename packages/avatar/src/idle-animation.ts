import type { VRM } from '@pixiv/three-vrm';

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

    // Breathing — gentle head bob (additive on reset base)
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.position.y += Math.sin(this.time * 1.5) * 0.003 * this.config.breathingIntensity;
    }

    // Subtle head sway
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.y += Math.sin(this.time * 0.3) * 0.02 * this.config.swayIntensity;
      neck.rotation.z += Math.sin(this.time * 0.5) * 0.01 * this.config.swayIntensity;
    }

    // Body-level idle motions (scaled by bodyIntensity)
    this.updateBody();

    // Blinking
    this.updateBlink(delta);
  }

  private updateBody(): void {
    if (!this.vrm) return;
    const bi = this.config.bodyIntensity;
    if (bi <= 0) return;

    // Weight shift — gentle lateral hip sway
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (hips) {
      hips.rotation.z += Math.sin(this.time * 0.2) * 0.015 * bi;
      hips.position.x += Math.sin(this.time * 0.2) * 0.002 * bi;
    }

    // Torso rock — breathing-linked forward/back sway
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.x += Math.sin(this.time * 1.5) * 0.008 * bi;
    }
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      chest.rotation.x += Math.sin(this.time * 1.5 + 0.5) * 0.005 * bi;
    }

    // Arm drift — natural arm hang movement (different phase per arm)
    const leftArm = this.vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (leftArm) {
      leftArm.rotation.z += Math.sin(this.time * 0.25 + 1.0) * 0.01 * bi;
    }
    if (rightArm) {
      rightArm.rotation.z += Math.sin(this.time * 0.25 + 2.0) * -0.01 * bi;
    }

    // Shoulder settle — micro-adjustments, opposing phase
    const leftShoulder = this.vrm.humanoid?.getNormalizedBoneNode('leftShoulder');
    const rightShoulder = this.vrm.humanoid?.getNormalizedBoneNode('rightShoulder');
    if (leftShoulder) {
      leftShoulder.rotation.y += Math.sin(this.time * 0.15) * 0.008 * bi;
    }
    if (rightShoulder) {
      rightShoulder.rotation.y += Math.sin(this.time * 0.15 + Math.PI) * 0.008 * bi;
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
        // Blink interval varies around configured frequency
        const half = this.config.blinkFrequency * 0.5;
        this.nextBlink = this.config.blinkFrequency - half + Math.random() * half * 2;
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
