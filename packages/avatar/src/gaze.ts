import type { VRM } from '@pixiv/three-vrm';

export type GazeMode = 'idle' | 'speaking' | 'listening' | 'awareness';

export type DockHint = 'top' | 'bottom' | 'left' | 'right' | 'floating' | 'fullscreen';

/** Seconds without setMousePosition before we treat the cursor as gone and decay. */
const MOUSE_INACTIVITY_THRESHOLD = 0.5;

/**
 * Hard caps on cumulative eye rotation (radians). Past these, the pupil
 * rolls out of the visible eye opening and the avatar looks possessed.
 * Narrowed to keep mouse-tracked motion natural-looking — even very large
 * cursor swings should produce only a subtle eye flick, not a full eye-roll.
 */
const EYE_PITCH_CAP = 0.18;
const EYE_YAW_CAP = 0.22;

/** Lerp speed used to bring eyes back to neutral while a reaction is active. */
const REACTION_RESET_LERP_SPEED = 6;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Gaze direction controller — adds head/eye target rotation to convey
 * where the avatar is looking. All bone modifications are additive,
 * layering on top of IdleAnimation and IdleVariationManager.
 *
 * Modes:
 *  - idle:      slow periodic drift toward screen center
 *  - speaking:  look straight at camera (neutral rotation)
 *  - listening: subtle lateral drift while waiting for input
 *  - awareness: tilt head away from docked screen edge
 */
export class GazeController {
  private vrm: VRM | null = null;
  private mode: GazeMode = 'idle';
  private dockHint: DockHint = 'floating';
  private time = 0;

  // Smoothed rotation targets (lerp toward goal each frame)
  private currentYaw = 0;
  private currentPitch = 0;

  // Mouse-tracked gaze (normalized 0-1 screen coords, null = no mouse input)
  private mouseX: number | null = null;
  private mouseY: number | null = null;
  private currentMouseYaw = 0;
  private currentMousePitch = 0;
  /** Seconds since last setMousePosition; drives drift-back when stale. */
  private timeSinceMouseUpdate = 0;
  /** When true, eyes lerp toward zero regardless of mouse target — used during reactions. */
  private suppressed = false;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.currentMouseYaw = 0;
    this.currentMousePitch = 0;
    this.timeSinceMouseUpdate = MOUSE_INACTIVITY_THRESHOLD;
  }

  setMode(mode: GazeMode): void {
    this.mode = mode;
  }

  setDockHint(dock: DockHint): void {
    this.dockHint = dock;
  }

  /** Accept normalized screen coordinates (0–1 range) for mouse-tracked gaze. */
  setMousePosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.timeSinceMouseUpdate = 0;
  }

  /** Cursor left the canvas — let the eyes drift back to neutral immediately. */
  clearMousePosition(): void {
    this.mouseX = null;
    this.mouseY = null;
  }

  /**
   * While suppressed, eyes lerp toward zero regardless of mouse position.
   * Used during click reactions so the eyes don't roll while the body flinches.
   */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  update(delta: number): void {
    if (!this.vrm) return;

    this.time += delta;
    this.timeSinceMouseUpdate += delta;

    let targetYaw = 0;
    let targetPitch = 0;
    let smoothSpeed = 2; // lerp speed (higher = snappier)

    switch (this.mode) {
      case 'idle':
        // Slow, dreamy drift — look vaguely around
        targetYaw = Math.sin(this.time * 0.15) * 0.08;
        targetPitch = Math.sin(this.time * 0.1 + 1.0) * 0.04;
        smoothSpeed = 1.5;
        break;

      case 'speaking':
        // Look at the user (camera) — neutral rotation, very slight natural wobble
        targetYaw = Math.sin(this.time * 0.4) * 0.01;
        targetPitch = Math.sin(this.time * 0.3) * 0.005;
        smoothSpeed = 3;
        break;

      case 'listening':
        // Slight lateral drift — thinking / waiting
        targetYaw = Math.sin(this.time * 0.25) * 0.06;
        targetPitch = -0.02 + Math.sin(this.time * 0.2) * 0.02; // slight downward cast
        smoothSpeed = 1.5;
        break;

      case 'awareness':
        // Look away from docked edge — avatar acknowledges its position
        targetYaw = this.dockYaw();
        targetPitch = this.dockPitch();
        // Add small idle drift on top
        targetYaw += Math.sin(this.time * 0.12) * 0.03;
        targetPitch += Math.sin(this.time * 0.1) * 0.02;
        smoothSpeed = 2;
        break;
    }

    // Smooth interpolation
    const lerpFactor = 1 - Math.exp(-smoothSpeed * delta);
    this.currentYaw += (targetYaw - this.currentYaw) * lerpFactor;
    this.currentPitch += (targetPitch - this.currentPitch) * lerpFactor;

    // Treat the mouse as gone if we haven't seen an update recently. The
    // canvas mousemove listener doesn't fire during scroll, focus loss, or
    // when the cursor parks outside, so a freshness check is the only
    // reliable signal that the user is no longer pointing at the avatar.
    const mouseStale =
      this.mouseX === null ||
      this.mouseY === null ||
      this.timeSinceMouseUpdate >= MOUSE_INACTIVITY_THRESHOLD;

    if (this.suppressed) {
      // Reactions take precedence — pull eyes to neutral hard.
      const lerp = 1 - Math.exp(-REACTION_RESET_LERP_SPEED * delta);
      this.currentMouseYaw += (0 - this.currentMouseYaw) * lerp;
      this.currentMousePitch += (0 - this.currentMousePitch) * lerp;
    } else if (!mouseStale && this.mouseX !== null && this.mouseY !== null) {
      // Pitch is negated to match VRM's eye-bone convention (negative pitch
      // = look up). Yaw is NOT negated — empirically yaw was already correct
      // in the original code. Sensitivities are conservative; the cap above
      // keeps even large cursor swings within natural eye-flick range.
      const mouseTargetYaw = (this.mouseX - 0.5) * 0.075;
      const mouseTargetPitch = -(this.mouseY - 0.5) * 0.025;
      const mouseLerp = 1 - Math.exp(-3 * delta);
      this.currentMouseYaw += (mouseTargetYaw - this.currentMouseYaw) * mouseLerp;
      this.currentMousePitch += (mouseTargetPitch - this.currentMousePitch) * mouseLerp;
    } else {
      // Drift back to neutral. Faster than before (was -2 → 86%/sec) so the
      // user can actually see the eyes settle.
      const decayLerp = 1 - Math.exp(-5 * delta);
      this.currentMouseYaw += (0 - this.currentMouseYaw) * decayLerp;
      this.currentMousePitch += (0 - this.currentMousePitch) * decayLerp;
    }

    // Apply additively — bones are reset to base each frame by resetBones()
    // Head gets mode drift + mouse influence (1x)
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.rotation.y += this.currentYaw + this.currentMouseYaw;
      head.rotation.x += this.currentPitch + this.currentMousePitch;
    }

    // Eyes get additional mouse layer (1x more) → 2:1 eye-to-head ratio in world-space
    const leftEye = this.vrm.humanoid?.getNormalizedBoneNode('leftEye');
    const rightEye = this.vrm.humanoid?.getNormalizedBoneNode('rightEye');
    if (leftEye) {
      leftEye.rotation.y += this.currentMouseYaw;
      leftEye.rotation.x += this.currentMousePitch;
      // Hard cap: regardless of who else (lookAt, expressions) wrote here,
      // never let the pupil roll out of the visible eye opening.
      leftEye.rotation.x = clamp(leftEye.rotation.x, EYE_PITCH_CAP);
      leftEye.rotation.y = clamp(leftEye.rotation.y, EYE_YAW_CAP);
    }
    if (rightEye) {
      rightEye.rotation.y += this.currentMouseYaw;
      rightEye.rotation.x += this.currentMousePitch;
      rightEye.rotation.x = clamp(rightEye.rotation.x, EYE_PITCH_CAP);
      rightEye.rotation.y = clamp(rightEye.rotation.y, EYE_YAW_CAP);
    }
  }

  /** Yaw offset based on dock position — look toward screen center (away from edge) */
  private dockYaw(): number {
    switch (this.dockHint) {
      case 'left':   return  0.10; // docked left → look right
      case 'right':  return -0.10; // docked right → look left
      default:       return  0;
    }
  }

  /** Pitch offset based on dock position */
  private dockPitch(): number {
    switch (this.dockHint) {
      case 'top':    return  0.06; // docked top → look down
      case 'bottom': return -0.06; // docked bottom → look up
      default:       return  0;
    }
  }
}
