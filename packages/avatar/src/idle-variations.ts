import type { VRM } from '@pixiv/three-vrm';
import type { IdleProfile } from '@aris/shared';

export type IdleVariationType = 'stretch' | 'glance' | 'settle' | 'deepBreath' | 'fidget' | 'stanceAdjust';

interface VariationDef {
  minInterval: number; // seconds
  maxInterval: number;
  duration: number;
  /** Called each frame with the absolute ease value (0→1→0 sine curve).
   *  Because bones are reset to base every frame, this is a pure additive
   *  offset — no cross-frame accumulation is possible. */
  apply: (vrm: VRM, ease: number) => void;
}

/**
 * Fires probabilistic idle variations to make the avatar feel alive:
 * - Stretch: shoulders rise + chest opens (~every 2-5 min)
 * - Glance: quick head turn to one side (~every 30-60s)
 * - Settle: weight readjustment through hips/spine (~every 45-90s)
 * - DeepBreath: chest expansion + spine extension (~every 60-120s)
 * - Fidget: small hand rotation oscillation (~every 40-80s)
 * - StanceAdjust: hips shift + spine compensation (~every 90-180s)
 *
 * Only one variation plays at a time. All bone modifications are additive
 * (`+=`) and rely on IdleAnimation.resetBones() being called each frame
 * to prevent drift.
 */
export class IdleVariationManager {
  private vrm: VRM | null = null;
  private frequencyScale = 1.0;
  private timers = new Map<IdleVariationType, number>();
  private active: { type: IdleVariationType; elapsed: number; duration: number } | null = null;
  /** Direction of the current glance: 1 = left, -1 = right */
  private glanceDirection = 1;
  /** Side of the current stance adjust: 1 = right, -1 = left */
  private stanceDirection = 1;
  // Personality-driven profile multipliers
  private profileFreqMultiplier = 1.0;
  private profileFidgetProbability = 0.4;

  private readonly variations: Record<IdleVariationType, VariationDef> = {
    stretch: {
      minInterval: 120,
      maxInterval: 300,
      duration: 2.0,
      apply: (vrm, ease) => {
        const leftShoulder = vrm.humanoid?.getNormalizedBoneNode('leftShoulder');
        const rightShoulder = vrm.humanoid?.getNormalizedBoneNode('rightShoulder');
        const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
        if (leftShoulder) leftShoulder.rotation.z += ease * 0.05;
        if (rightShoulder) rightShoulder.rotation.z -= ease * 0.05;
        if (chest) chest.rotation.x -= ease * 0.03;
      },
    },
    glance: {
      minInterval: 30,
      maxInterval: 60,
      duration: 1.2,
      apply: (vrm, ease) => {
        const head = vrm.humanoid?.getNormalizedBoneNode('head');
        if (head) {
          head.rotation.y += ease * 0.15 * this.glanceDirection;
          head.rotation.x += ease * 0.02;
        }
      },
    },
    settle: {
      minInterval: 45,
      maxInterval: 90,
      duration: 1.5,
      apply: (vrm, ease) => {
        const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
        const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
        if (hips) {
          hips.position.y -= ease * 0.005;
          hips.rotation.z += ease * 0.02;
        }
        if (spine) spine.rotation.z -= ease * 0.01;
      },
    },
    // 2D: Deep breath — chest expands, spine extends, slow exhale settle (~every 60-120s)
    deepBreath: {
      minInterval: 60,
      maxInterval: 120,
      duration: 3.0,
      apply: (vrm, ease) => {
        const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
        const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
        const head = vrm.humanoid?.getNormalizedBoneNode('head');
        if (chest) chest.rotation.x -= ease * 0.04; // open chest
        if (spine) spine.rotation.x -= ease * 0.02; // spine extension
        if (head) head.rotation.x -= ease * 0.015;  // slight head lift
      },
    },
    // 2D: Fidget — small hand rotation oscillation (~every 40-80s)
    fidget: {
      minInterval: 40,
      maxInterval: 80,
      duration: 1.0,
      apply: (vrm, ease) => {
        const leftHand = vrm.humanoid?.getNormalizedBoneNode('leftHand');
        const rightHand = vrm.humanoid?.getNormalizedBoneNode('rightHand');
        if (leftHand) leftHand.rotation.z += ease * 0.06;
        if (rightHand) rightHand.rotation.z -= ease * 0.04;
      },
    },
    // 2D: Stance adjust — hips shift laterally with spine compensation (~every 90-180s)
    stanceAdjust: {
      minInterval: 90,
      maxInterval: 180,
      duration: 2.0,
      apply: (vrm, ease) => {
        const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
        const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
        if (hips) {
          hips.position.x += ease * 0.008 * this.stanceDirection;
          hips.rotation.z += ease * 0.025 * this.stanceDirection;
        }
        if (spine) spine.rotation.z -= ease * 0.015 * this.stanceDirection;
      },
    },
  };

  constructor() {
    for (const [type, def] of Object.entries(this.variations) as [IdleVariationType, VariationDef][]) {
      this.timers.set(type, this.randomInterval(def));
    }
  }

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  setFrequencyScale(scale: number): void {
    this.frequencyScale = Math.max(0, Math.min(1, scale));
  }

  setIdleProfile(profile: IdleProfile): void {
    this.profileFreqMultiplier = profile.variationFrequencyMultiplier;
    this.profileFidgetProbability = profile.fidgetProbability;
  }

  update(delta: number): void {
    if (!this.vrm) return;

    // If a variation is currently playing, apply absolute ease offset
    if (this.active) {
      this.active.elapsed += delta;
      const progress = Math.min(this.active.elapsed / this.active.duration, 1);
      const ease = Math.sin(progress * Math.PI); // 0 → 1 → 0
      this.variations[this.active.type].apply(this.vrm, ease);
      if (progress >= 1) {
        this.active = null;
      }
      return;
    }

    if (this.frequencyScale <= 0) return;

    // Tick timers and fire the first one that's ready
    for (const [type, def] of Object.entries(this.variations) as [IdleVariationType, VariationDef][]) {
      const remaining = (this.timers.get(type) ?? 0) - delta;
      if (remaining <= 0) {
        // Gate fidgets by profile probability
        if (type === 'fidget' && Math.random() > this.profileFidgetProbability) {
          this.timers.set(type, this.randomInterval(def));
          continue;
        }
        // Alternate glance direction each time
        if (type === 'glance') {
          this.glanceDirection = this.glanceDirection > 0 ? -1 : 1;
        }
        // Alternate stance adjust direction each time
        if (type === 'stanceAdjust') {
          this.stanceDirection = this.stanceDirection > 0 ? -1 : 1;
        }
        this.active = { type, elapsed: 0, duration: def.duration };
        this.timers.set(type, this.randomInterval(def));
        return;
      }
      this.timers.set(type, remaining);
    }
  }

  private randomInterval(def: VariationDef): number {
    const base = def.minInterval + Math.random() * (def.maxInterval - def.minInterval);
    const effectiveScale = Math.max(this.frequencyScale * this.profileFreqMultiplier, 0.1);
    return base / effectiveScale;
  }
}
