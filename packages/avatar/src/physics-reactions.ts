import type { VRM } from '@pixiv/three-vrm';
import type { ExpressionController } from './expressions';
import type { WindowShakeEvent } from '@aris/shared';

const LIGHT_DURATION = 1.2;
const MEDIUM_DURATION = 2.0;
const HARD_FALL_DURATION = 0.8;
const HARD_CROUCH_DURATION = 0.6;
const HARD_RECOVER_DURATION = 2.2;

type Phase = 'idle' | 'light' | 'medium' | 'hard-fall' | 'hard-crouch' | 'hard-recover';

/**
 * PhysicsReactionController — avatar reacts physically to window:shake IPC events.
 *
 * Three intensity tiers:
 * - light:  head wobble + arm sway (inertia direction), 1.2 s
 * - medium: stumble — hips shift, arms flail for balance, 2.0 s
 * - hard:   full fall → crouch hold → 2.2 s stand-up recovery
 *
 * Velocity direction drives inertia: drag right → avatar leans left.
 * Spring-bone gravity is injected during active reactions via joint.settings.gravityDir.
 *
 * Call `triggerShake(event)` when a window:shake IPC event fires.
 * Call `update(delta)` each frame (after variations, before expressions).
 */
export class PhysicsReactionController {
  private vrm: VRM | null = null;
  private expr: ExpressionController | null = null;

  private phase: Phase = 'idle';
  private elapsed = 0;
  /** Inertia lean direction: opposite of velocity, normalized -1..1 */
  private leanX = 0;
  private leanY = 0;
  private exprRestoreTimer = 0;
  /** Gravity applied to spring bones before the reaction, restored on idle */
  private defaultGravitySet = false;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.phase = 'idle';
    this.elapsed = 0;
    this.leanX = 0;
    this.leanY = 0;
    this.exprRestoreTimer = 0;
    this.defaultGravitySet = false;
  }

  setExpressionController(expr: ExpressionController): void {
    this.expr = expr;
  }

  isActive(): boolean {
    return this.phase !== 'idle';
  }

  /** Call this when a window:shake IPC event arrives. */
  triggerShake(event: WindowShakeEvent): void {
    // Normalize velocity → inertia lean (opposite of motion direction)
    const maxVel = 40;
    this.leanX = Math.max(-1, Math.min(1, -event.velocityX / maxVel));
    this.leanY = Math.max(-1, Math.min(1, -event.velocityY / maxVel));

    if (event.intensity === 'hard') {
      this.phase = 'hard-fall';
      this.elapsed = 0;
      this.expr?.setExpression('surprised');
      this.exprRestoreTimer = HARD_FALL_DURATION + HARD_CROUCH_DURATION;
    } else if (event.intensity === 'medium') {
      // Don't interrupt hard fall/crouch/recover
      if (
        this.phase !== 'hard-fall' &&
        this.phase !== 'hard-crouch' &&
        this.phase !== 'hard-recover'
      ) {
        this.phase = 'medium';
        this.elapsed = 0;
        this.expr?.setExpression('surprised');
        this.exprRestoreTimer = 0.6;
      }
    } else {
      // light — only if fully idle (don't interrupt ongoing reactions)
      if (this.phase === 'idle') {
        this.phase = 'light';
        this.elapsed = 0;
        this.expr?.setExpression('surprised');
        this.exprRestoreTimer = 0.3;
      }
    }
  }

  update(delta: number): void {
    if (!this.vrm || this.phase === 'idle') return;

    // Expression restore countdown
    if (this.exprRestoreTimer > 0) {
      this.exprRestoreTimer -= delta;
      if (this.exprRestoreTimer <= 0) {
        this.expr?.setExpression('neutral');
      }
    }

    this.elapsed += delta;

    switch (this.phase) {
      case 'light':
        this.applyLightWobble();
        if (this.elapsed >= LIGHT_DURATION) this.phase = 'idle';
        break;

      case 'medium':
        this.applyMediumStumble();
        if (this.elapsed >= MEDIUM_DURATION) this.phase = 'idle';
        break;

      case 'hard-fall':
        this.applyHardFall();
        if (this.elapsed >= HARD_FALL_DURATION) {
          this.phase = 'hard-crouch';
          this.elapsed = 0;
        }
        break;

      case 'hard-crouch':
        this.applyHardCrouch();
        if (this.elapsed >= HARD_CROUCH_DURATION) {
          this.phase = 'hard-recover';
          this.elapsed = 0;
        }
        break;

      case 'hard-recover':
        this.applyHardRecover();
        if (this.elapsed >= HARD_RECOVER_DURATION) {
          this.phase = 'idle';
          this.clearSpringBoneGravity();
        }
        break;
    }

    // Inject spring-bone gravity during active reactions
    if (this.phase !== 'idle') {
      this.applySpringBoneForce();
    }
  }

  // ---------------------------------------------------------------------------
  // Light wobble (1.2 s)
  // ---------------------------------------------------------------------------

  private applyLightWobble(): void {
    const vrm = this.vrm!;
    const t = this.elapsed / LIGHT_DURATION;
    const env = Math.sin(t * Math.PI); // 0 → peak → 0

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');

    // Head wobbles opposite velocity (inertia)
    if (head) {
      head.rotation.z += this.leanX * 0.12 * env;
      head.rotation.x += this.leanY * 0.08 * env;
    }
    if (neck) {
      neck.rotation.z += this.leanX * 0.06 * env;
    }
    // Arms sway with momentum
    if (leftArm) leftArm.rotation.z += this.leanX * 0.15 * env;
    if (rightArm) rightArm.rotation.z += this.leanX * 0.15 * env;
  }

  // ---------------------------------------------------------------------------
  // Medium stumble (2.0 s)
  // ---------------------------------------------------------------------------

  private applyMediumStumble(): void {
    const vrm = this.vrm!;
    const t = this.elapsed / MEDIUM_DURATION;
    const env = Math.sin(t * Math.PI);

    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');

    // Hips shift opposite velocity (stumble/inertia) with slight squat
    if (hips) {
      hips.rotation.z += this.leanX * 0.20 * env;
      hips.position.x += this.leanX * 0.04 * env;
      hips.position.y -= Math.abs(env) * 0.04;
    }
    // Spine compensates, leans counter to hip shift
    if (spine) {
      spine.rotation.z -= this.leanX * 0.10 * env;
      spine.rotation.x += this.leanY * 0.08 * env;
    }
    if (head) {
      head.rotation.z += this.leanX * 0.10 * env;
    }
    // Arms flail for balance — opposite to each other
    if (leftArm) {
      leftArm.rotation.z += (this.leanX > 0 ? 0.50 : -0.30) * env;
      leftArm.rotation.x += 0.20 * env;
    }
    if (rightArm) {
      rightArm.rotation.z += (this.leanX > 0 ? -0.30 : 0.50) * env;
      rightArm.rotation.x += 0.20 * env;
    }
  }

  // ---------------------------------------------------------------------------
  // Hard fall (0.8 s) — accelerating collapse
  // ---------------------------------------------------------------------------

  private applyHardFall(): void {
    const vrm = this.vrm!;
    const t = this.elapsed / HARD_FALL_DURATION;
    const env = t * t; // ease-in: accelerates toward full collapse

    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    const leftForearm = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    const rightForearm = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');

    if (hips) {
      hips.position.y -= 0.15 * env;
      hips.rotation.z += this.leanX * 0.30 * env;
    }
    if (spine) {
      spine.rotation.x += 0.25 * env;
      spine.rotation.z += this.leanX * 0.15 * env;
    }
    if (chest) {
      chest.rotation.x += 0.20 * env;
    }
    if (head) {
      // Head whips in inertia direction, tilts back during fall
      head.rotation.z += this.leanX * 0.25 * env;
      head.rotation.x -= 0.15 * env;
    }
    // Arms spread wide to brace
    if (leftArm) {
      leftArm.rotation.z += 0.60 * env;
      leftArm.rotation.x -= 0.20 * env;
    }
    if (rightArm) {
      rightArm.rotation.z -= 0.60 * env;
      rightArm.rotation.x -= 0.20 * env;
    }
    if (leftForearm) leftForearm.rotation.z += 0.30 * env;
    if (rightForearm) rightForearm.rotation.z -= 0.30 * env;
  }

  // ---------------------------------------------------------------------------
  // Hard crouch hold (0.6 s) — landed, absorb impact
  // ---------------------------------------------------------------------------

  private applyHardCrouch(): void {
    const vrm = this.vrm!;
    const t = Math.min(this.elapsed / HARD_CROUCH_DURATION, 1);
    // Brief landing bounce
    const landBounce = Math.sin(t * Math.PI * 2) * 0.03;

    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');

    if (hips) {
      hips.position.y -= 0.15 + landBounce;
      hips.rotation.z += this.leanX * 0.20;
    }
    if (spine) {
      spine.rotation.x += 0.25;
      spine.rotation.z += this.leanX * 0.12;
    }
    if (chest) {
      chest.rotation.x += 0.20;
    }
    if (head) {
      head.rotation.z += this.leanX * 0.10;
      head.rotation.x += 0.05; // look slightly down after landing
    }
    // Arms settle at partially-braced position
    if (leftArm) leftArm.rotation.z += 0.40;
    if (rightArm) rightArm.rotation.z -= 0.40;
  }

  // ---------------------------------------------------------------------------
  // Hard recover (2.2 s) — slow stand-up
  // ---------------------------------------------------------------------------

  private applyHardRecover(): void {
    const vrm = this.vrm!;
    const t = Math.min(this.elapsed / HARD_RECOVER_DURATION, 1);
    // Ease-out: moves quickly at first, slows as fully upright
    const recovery = t * (2 - t);
    const env = 1 - recovery; // 1 → 0 as fully recovered

    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const leftArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');

    if (hips) {
      hips.position.y -= 0.15 * env;
      hips.rotation.z += this.leanX * 0.20 * env;
    }
    if (spine) {
      spine.rotation.x += 0.25 * env;
      spine.rotation.z += this.leanX * 0.12 * env;
    }
    if (chest) {
      chest.rotation.x += 0.20 * env;
    }
    if (head) {
      head.rotation.z += this.leanX * 0.10 * env;
      head.rotation.x += 0.05 * env;
    }
    if (leftArm) leftArm.rotation.z += 0.40 * env;
    if (rightArm) rightArm.rotation.z -= 0.40 * env;
  }

  // ---------------------------------------------------------------------------
  // Spring-bone gravity injection
  // ---------------------------------------------------------------------------

  private applySpringBoneForce(): void {
    const vrm = this.vrm!;
    const forceX = this.leanX * 0.01;
    const forceY = -0.005;
    vrm.springBoneManager?.joints.forEach((joint) => {
      joint.settings.gravityDir.set(forceX, -1 + forceY, 0);
    });
    this.defaultGravitySet = false;
  }

  private clearSpringBoneGravity(): void {
    if (this.defaultGravitySet) return;
    this.vrm?.springBoneManager?.joints.forEach((joint) => {
      joint.settings.gravityDir.set(0, -1, 0);
    });
    this.defaultGravitySet = true;
  }
}
