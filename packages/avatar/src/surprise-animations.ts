import type { VRM } from '@pixiv/three-vrm';
import type { ExpressionController } from './expressions';
import type { GestureController } from './gestures';

const AFK_WAVE_SECONDS = 120;  // 2 minutes
const AFK_SLEEP_SECONDS = 300; // 5 minutes
const SLEEP_ONSET_SECONDS = 30;
const SLEEP_HEAD_DROOP = 0.25; // radians of additive pitch

// Sneeze: ~1/1000 chance per minute → checked every 60s
const SNEEZE_CHECK_INTERVAL = 60;
const SNEEZE_CHANCE = 1 / 1000;
// Surprised expression flash duration after sneeze/wake (seconds)
const WAKE_FLASH_DURATION = 0.6;
const SNEEZE_RETURN_DELAY = 1000; // ms

type AfkState = 'active' | 'wave-queued' | 'wave-done' | 'sleeping';

/**
 * SurpriseAnimationController — rare personality-driven animations.
 *
 * Manages three behaviors:
 * - **Sneeze**: ~1/1000 probability per minute check (≈ once every 16 h).
 *   Plays the 'sneeze' gesture + surprised flash, then returns to neutral.
 * - **AFK wave**: after 2+ min idle, 20% chance to wave once per AFK period.
 * - **Sleep cycle**: after 5+ min idle — sleepy expression + gradual head droop.
 *   On any input: quick head lift + surprised flash, then returns to neutral.
 *
 * Call `notifyInput()` on keyboard/mouse events.
 * Call `update(delta)` each frame after bones are reset (additive bone writes).
 */
export class SurpriseAnimationController {
  private vrm: VRM | null = null;
  private expr: ExpressionController | null = null;
  private gesture: GestureController | null = null;

  private sneezeTimer = 0;
  private afkTime = 0;
  private afkState: AfkState = 'active';
  private sleepOnsetElapsed = 0;
  private sleepHeadPitch = 0;
  private wakeFlashTimer = 0;
  private sneezeReturnHandle: ReturnType<typeof setTimeout> | null = null;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  setControllers(expr: ExpressionController, gesture: GestureController): void {
    this.expr = expr;
    this.gesture = gesture;
  }

  /** Call whenever keyboard or mouse input fires in the renderer. */
  notifyInput(): void {
    const wasSleeping = this.afkState === 'sleeping';
    this.afkTime = 0;
    this.sleepOnsetElapsed = 0;
    this.sleepHeadPitch = 0;
    this.afkState = 'active';

    if (wasSleeping) {
      this.wakeFlashTimer = WAKE_FLASH_DURATION;
      this.expr?.setExpression('surprised');
    }
  }

  update(delta: number): void {
    if (!this.vrm) return;

    // --- Wake flash decay ---
    if (this.wakeFlashTimer > 0) {
      this.wakeFlashTimer -= delta;
      if (this.wakeFlashTimer <= 0) {
        this.expr?.setExpression('neutral');
      }
    }

    // --- Sneeze ---
    this.sneezeTimer += delta;
    if (this.sneezeTimer >= SNEEZE_CHECK_INTERVAL) {
      this.sneezeTimer -= SNEEZE_CHECK_INTERVAL;
      if (Math.random() < SNEEZE_CHANCE && !this.gesture?.isPlaying()) {
        this.triggerSneeze();
      }
    }

    // --- AFK progression ---
    this.afkTime += delta;

    if (this.afkState === 'active' && this.afkTime >= AFK_WAVE_SECONDS) {
      this.afkState = Math.random() < 0.2 ? 'wave-queued' : 'wave-done';
    }

    if (this.afkState === 'wave-queued' && !this.gesture?.isPlaying()) {
      this.gesture?.play('wave');
      this.afkState = 'wave-done';
    }

    if (this.afkTime >= AFK_SLEEP_SECONDS && this.afkState !== 'sleeping') {
      this.afkState = 'sleeping';
      this.sleepOnsetElapsed = 0;
      this.expr?.setExpression('sleepy');
    }

    // --- Sleep head droop ---
    if (this.afkState === 'sleeping') {
      this.sleepOnsetElapsed = Math.min(this.sleepOnsetElapsed + delta, SLEEP_ONSET_SECONDS);
      const progress = this.sleepOnsetElapsed / SLEEP_ONSET_SECONDS;
      const targetPitch = SLEEP_HEAD_DROOP * progress;
      // Smooth lerp toward target droop
      this.sleepHeadPitch += (targetPitch - this.sleepHeadPitch) * Math.min(delta * 2, 1);

      const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.x += this.sleepHeadPitch;
      }
    }
  }

  dispose(): void {
    if (this.sneezeReturnHandle !== null) {
      clearTimeout(this.sneezeReturnHandle);
      this.sneezeReturnHandle = null;
    }
  }

  private triggerSneeze(): void {
    this.gesture!.play('sneeze');
    this.expr?.setExpression('surprised');
    if (this.sneezeReturnHandle !== null) {
      clearTimeout(this.sneezeReturnHandle);
    }
    this.sneezeReturnHandle = setTimeout(() => {
      this.sneezeReturnHandle = null;
      this.expr?.setExpression('neutral');
    }, SNEEZE_RETURN_DELAY);
  }
}
