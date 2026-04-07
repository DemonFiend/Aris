import type { VRM } from '@pixiv/three-vrm';

export type IdleVariationType = 'stretch' | 'glance' | 'settle';

interface VariationDef {
  minInterval: number; // seconds
  maxInterval: number;
  duration: number;
  apply: (vrm: VRM, progress: number) => void;
}

/**
 * Fires probabilistic idle variations to make the avatar feel alive:
 * - Stretch: shoulders rise + chest opens (~every 2-5 min)
 * - Glance: quick head turn to one side (~every 30-60s)
 * - Settle: weight readjustment through hips/spine (~every 45-90s)
 *
 * Only one variation plays at a time. All bone modifications are additive
 * so they layer on top of the base IdleAnimation.
 */
export class IdleVariationManager {
  private vrm: VRM | null = null;
  private frequencyScale = 1.0;
  private timers = new Map<IdleVariationType, number>();
  private active: { type: IdleVariationType; elapsed: number; duration: number } | null = null;
  /** Direction of the current glance: 1 = left, -1 = right */
  private glanceDirection = 1;

  private readonly variations: Record<IdleVariationType, VariationDef> = {
    stretch: {
      minInterval: 120,
      maxInterval: 300,
      duration: 2.0,
      apply: (vrm, progress) => {
        const ease = Math.sin(progress * Math.PI);
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
      apply: (vrm, progress) => {
        const ease = Math.sin(progress * Math.PI);
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
      apply: (vrm, progress) => {
        const ease = Math.sin(progress * Math.PI);
        const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
        const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
        if (hips) {
          hips.position.y -= ease * 0.005;
          hips.rotation.z += ease * 0.02;
        }
        if (spine) spine.rotation.z -= ease * 0.01;
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

  update(delta: number): void {
    if (!this.vrm) return;

    // If a variation is currently playing, apply it
    if (this.active) {
      this.active.elapsed += delta;
      const progress = Math.min(this.active.elapsed / this.active.duration, 1);
      this.variations[this.active.type].apply(this.vrm, progress);
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
        // Alternate glance direction each time
        if (type === 'glance') {
          this.glanceDirection = this.glanceDirection > 0 ? -1 : 1;
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
    return base / Math.max(this.frequencyScale, 0.1);
  }
}
