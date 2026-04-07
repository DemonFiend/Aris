import type { VRM } from '@pixiv/three-vrm';

export type GazeMode = 'idle' | 'speaking' | 'listening' | 'awareness';

export type DockHint = 'top' | 'bottom' | 'left' | 'right' | 'floating' | 'fullscreen';

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

  // Last applied values — used to compute delta so rotations don't accumulate
  private lastAppliedYaw = 0;
  private lastAppliedPitch = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.lastAppliedYaw = 0;
    this.lastAppliedPitch = 0;
  }

  setMode(mode: GazeMode): void {
    this.mode = mode;
  }

  setDockHint(dock: DockHint): void {
    this.dockHint = dock;
  }

  update(delta: number): void {
    if (!this.vrm) return;

    this.time += delta;

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

    // Apply additively to head bone using delta to prevent accumulation
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.rotation.y += this.currentYaw - this.lastAppliedYaw;
      head.rotation.x += this.currentPitch - this.lastAppliedPitch;
      this.lastAppliedYaw = this.currentYaw;
      this.lastAppliedPitch = this.currentPitch;
      // Clamp to safe ranges to prevent extreme poses
      head.rotation.y = Math.max(-0.5, Math.min(0.5, head.rotation.y));
      head.rotation.x = Math.max(-0.3, Math.min(0.3, head.rotation.x));
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
