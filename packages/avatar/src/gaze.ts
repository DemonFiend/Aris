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

  // Mouse-tracked gaze (normalized 0-1 screen coords, null = no mouse input)
  private mouseX: number | null = null;
  private mouseY: number | null = null;
  private currentMouseYaw = 0;
  private currentMousePitch = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.currentMouseYaw = 0;
    this.currentMousePitch = 0;
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

    // Smooth mouse-tracked gaze — lerp toward mouse target or decay to zero
    if (this.mouseX !== null && this.mouseY !== null) {
      const mouseTargetYaw = (this.mouseX - 0.5) * 0.15;
      const mouseTargetPitch = (this.mouseY - 0.5) * 0.1;
      const mouseLerp = 1 - Math.exp(-3 * delta);
      this.currentMouseYaw += (mouseTargetYaw - this.currentMouseYaw) * mouseLerp;
      this.currentMousePitch += (mouseTargetPitch - this.currentMousePitch) * mouseLerp;
    } else {
      const decayLerp = 1 - Math.exp(-2 * delta);
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
    }
    if (rightEye) {
      rightEye.rotation.y += this.currentMouseYaw;
      rightEye.rotation.x += this.currentMousePitch;
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
