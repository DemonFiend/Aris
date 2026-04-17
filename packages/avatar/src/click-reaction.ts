import type { VRM } from '@pixiv/three-vrm';
import type { ExpressionController } from './expressions';
import type { GestureController } from './gestures';
import type { ClickReactionType } from '@aris/shared';

/** Rolling window (seconds) within which clicks accumulate before resetting. */
const CLICK_WINDOW = 10;

/** Duration of each reaction animation (seconds). */
const REACTION_DURATIONS: Record<ClickReactionType, number> = {
  surprised: 0.6,
  giggle: 0.9,
  annoyed: 1.2,
  pushback: 1.4,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth-step easing (same as GestureController). */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * ClickReactionController — escalating avatar reactions to repeated clicks.
 *
 * Track clicks within a rolling window and play increasingly annoyed reactions:
 *  1st click  → surprised (head tilt back + surprised expression)
 *  2nd click  → giggle (playful head shake + happy expression)
 *  3rd–4th    → annoyed (arms-crossed gesture + angry expression)
 *  5th+       → pushback (lean away + exaggerated angry expression)
 *
 * Call `trigger()` when a raycast hit is confirmed on the avatar mesh.
 * Call `update(delta)` each frame after gesture.update().
 * While a reaction is playing, `isPlaying()` returns true — callers can
 * use this to suppress conflicting gesture playback.
 */
export class ClickReactionController {
  private vrm: VRM | null = null;
  private expr: ExpressionController | null = null;
  private gesture: GestureController | null = null;

  /** Timestamps of recent clicks (monotonic seconds via accumulated delta). */
  private clickTimes: number[] = [];
  /** Monotonic clock accumulated from update() deltas. */
  private clock = 0;

  private activeReaction: ClickReactionType | null = null;
  private elapsed = 0;
  private duration = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  setControllers(expr: ExpressionController, gesture: GestureController): void {
    this.expr = expr;
    this.gesture = gesture;
  }

  /** Call when the user clicks on the avatar mesh. */
  trigger(): void {
    if (!this.vrm) return;

    // Record click time
    this.clickTimes.push(this.clock);

    // Prune clicks older than the rolling window
    const cutoff = this.clock - CLICK_WINDOW;
    this.clickTimes = this.clickTimes.filter((t) => t >= cutoff);

    const count = this.clickTimes.length;
    const reaction = this.pickReaction(count);

    // Interrupt any current reaction and start the new one
    this.activeReaction = reaction;
    this.elapsed = 0;
    this.duration = REACTION_DURATIONS[reaction];

    // Stop any gesture that might be in progress
    this.gesture?.stop();

    // Set expression for this reaction
    switch (reaction) {
      case 'surprised':
        this.expr?.setExpression('surprised');
        break;
      case 'giggle':
        this.expr?.setExpression('happy');
        break;
      case 'annoyed':
      case 'pushback':
        this.expr?.setExpression('angry');
        break;
    }
  }

  isPlaying(): boolean {
    return this.activeReaction !== null;
  }

  update(delta: number): void {
    this.clock += delta;

    if (!this.vrm || !this.activeReaction) return;

    this.elapsed += delta;

    if (this.elapsed >= this.duration) {
      // Reaction finished — restore neutral expression
      this.expr?.setExpression('neutral');
      this.activeReaction = null;
      return;
    }

    const t = this.elapsed / this.duration;

    switch (this.activeReaction) {
      case 'surprised':
        this.applySurprised(t);
        break;
      case 'giggle':
        this.applyGiggle(t);
        break;
      case 'annoyed':
        this.applyAnnoyed(t);
        break;
      case 'pushback':
        this.applyPushback(t);
        break;
    }
  }

  private pickReaction(clickCount: number): ClickReactionType {
    if (clickCount >= 5) return 'pushback';
    if (clickCount >= 3) return 'annoyed';
    if (clickCount >= 2) return 'giggle';
    return 'surprised';
  }

  // ---------------------------------------------------------------------------
  // Surprised — small head tilt back (0.6 s)
  // ---------------------------------------------------------------------------

  private applySurprised(t: number): void {
    const vrm = this.vrm!;
    const env = Math.sin(t * Math.PI); // 0 → peak → 0

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');

    if (head) {
      head.rotation.x += lerp(0, -0.15, ease(env));
    }
    if (neck) {
      neck.rotation.x += lerp(0, -0.05, ease(env));
    }
  }

  // ---------------------------------------------------------------------------
  // Giggle — playful head shake + slight body bounce (0.9 s)
  // ---------------------------------------------------------------------------

  private applyGiggle(t: number): void {
    const vrm = this.vrm!;
    const env = Math.sin(t * Math.PI);

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');

    // Quick oscillating head shake
    const shakeFreq = t * Math.PI * 6; // ~3 oscillations across the animation
    if (head) {
      head.rotation.y += Math.sin(shakeFreq) * 0.12 * env;
      head.rotation.z += Math.sin(shakeFreq * 0.7) * 0.05 * env;
    }
    // Subtle body bounce
    if (spine) {
      spine.rotation.x += Math.sin(t * Math.PI * 4) * 0.03 * env;
    }
  }

  // ---------------------------------------------------------------------------
  // Annoyed — arms cross + head tilt (1.2 s)
  // ---------------------------------------------------------------------------

  private applyAnnoyed(t: number): void {
    const vrm = this.vrm!;
    const env = Math.sin(t * Math.PI);

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    const leftForearm = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    const rightForearm = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');

    // Disapproving head tilt
    if (head) {
      head.rotation.z += lerp(0, -0.1, ease(env));
      head.rotation.x += lerp(0, 0.05, ease(env));
    }

    // Arms crossed pose (additive)
    const armEnv = ease(Math.min(t * 2, 1)) * (1 - ease(Math.max((t - 0.7) / 0.3, 0)));
    if (leftArm) {
      leftArm.rotation.z += 0.65 * armEnv;
      leftArm.rotation.x += -0.45 * armEnv;
    }
    if (rightArm) {
      rightArm.rotation.z += -0.65 * armEnv;
      rightArm.rotation.x += -0.45 * armEnv;
    }
    if (leftForearm) leftForearm.rotation.y += 0.3 * armEnv;
    if (rightForearm) rightForearm.rotation.y += -0.3 * armEnv;
  }

  // ---------------------------------------------------------------------------
  // Pushback — exaggerated lean away + dismissive gesture (1.4 s)
  // ---------------------------------------------------------------------------

  private applyPushback(t: number): void {
    const vrm = this.vrm!;
    const env = Math.sin(t * Math.PI);

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    const rightForearm = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');

    // Lean away — entire torso tilts back
    if (hips) {
      hips.rotation.x += lerp(0, -0.06, ease(env));
    }
    if (spine) {
      spine.rotation.x += lerp(0, -0.12, ease(env));
    }
    if (neck) {
      neck.rotation.x += lerp(0, -0.08, ease(env));
    }
    if (head) {
      head.rotation.x += lerp(0, -0.1, ease(env));
      // Slight head turn away
      head.rotation.y += lerp(0, 0.12, ease(env));
    }

    // Right arm pushes forward (stop/go-away gesture)
    const armEnv = ease(Math.min(t * 2.5, 1)) * (1 - ease(Math.max((t - 0.6) / 0.4, 0)));
    if (rightArm) {
      rightArm.rotation.z += -0.8 * armEnv;
      rightArm.rotation.x += -0.3 * armEnv;
    }
    if (rightForearm) {
      rightForearm.rotation.z += -0.3 * armEnv;
    }

    // Left arm on hip (annoyed stance)
    if (leftArm) {
      leftArm.rotation.z += 0.5 * armEnv;
      leftArm.rotation.x += 0.25 * armEnv;
    }
  }
}
