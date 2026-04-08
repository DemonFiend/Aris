import type { VRM } from '@pixiv/three-vrm';

type MicroExpressionType = 'halfSmile' | 'eyebrowRaise' | 'lipPurse' | 'noseWrinkle' | 'squint';

interface MicroExpressionDef {
  /** VRM expression manager key to additively modify */
  blendKey: string;
  /** Maximum additive weight at peak of the twitch */
  weight: number;
  /** Total duration of the twitch in seconds */
  duration: number;
}

const MICRO_EXPRESSIONS: Record<MicroExpressionType, MicroExpressionDef> = {
  halfSmile:    { blendKey: 'happy',     weight: 0.2,  duration: 0.5 },
  eyebrowRaise: { blendKey: 'surprised', weight: 0.3,  duration: 0.4 },
  lipPurse:     { blendKey: 'relaxed',   weight: 0.2,  duration: 0.3 },
  noseWrinkle:  { blendKey: 'angry',     weight: 0.15, duration: 0.4 },
  squint:       { blendKey: 'angry',     weight: 0.1,  duration: 0.6 },
};

const MICRO_TYPES = Object.keys(MICRO_EXPRESSIONS) as MicroExpressionType[];

const MIN_INTERVAL = 5;
const MAX_INTERVAL = 20;

/**
 * MicroExpressionController — fleeting probabilistic blend-shape twitches.
 *
 * Fires one micro-expression at a time at random intervals (5–20 s).
 * Each twitch uses ease-in/ease-out via a half-sine envelope (0 → peak → 0).
 *
 * Must run AFTER ExpressionController in the frame loop so the base expression
 * is already applied before this adds its additive layer on top.
 *
 * Tracks its previous frame contribution to cleanly undo it each frame,
 * preventing accumulation regardless of what ExpressionController does.
 */
export class MicroExpressionController {
  private vrm: VRM | null = null;
  private nextFire = this.randomInterval();
  private elapsed = 0;
  private active: { def: MicroExpressionDef; elapsed: number } | null = null;
  /** Additive weight applied in the previous frame — subtracted each frame to prevent drift. */
  private prevContrib = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.active = null;
    this.prevContrib = 0;
    this.elapsed = 0;
    this.nextFire = this.randomInterval();
  }

  update(delta: number): void {
    if (!this.vrm?.expressionManager) return;

    if (this.active) {
      this.active.elapsed += delta;
      const progress = Math.min(this.active.elapsed / this.active.def.duration, 1);
      // Ease-in/ease-out envelope: 0 → 1 → 0 via half-sine
      const ease = Math.sin(progress * Math.PI);
      const newContrib = ease * this.active.def.weight;

      const blendKey = this.active.def.blendKey;
      const current = this.vrm.expressionManager.getValue(blendKey) ?? 0;
      // Undo previous frame contribution, apply new one
      const adjusted = Math.max(0, Math.min(1, current - this.prevContrib + newContrib));
      this.vrm.expressionManager.setValue(blendKey, adjusted);
      this.prevContrib = newContrib;

      if (progress >= 1) {
        this.prevContrib = 0;
        this.active = null;
      }
      return;
    }

    this.prevContrib = 0;
    this.elapsed += delta;
    if (this.elapsed >= this.nextFire) {
      this.elapsed = 0;
      this.nextFire = this.randomInterval();
      const type = MICRO_TYPES[Math.floor(Math.random() * MICRO_TYPES.length)];
      this.active = { def: MICRO_EXPRESSIONS[type], elapsed: 0 };
    }
  }

  private randomInterval(): number {
    return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  }
}
