import type { VRM } from '@pixiv/three-vrm';

/**
 * Idle animation controller that adds subtle life to the avatar:
 * - Breathing (slight head bob)
 * - Blinking at random intervals
 * - Subtle head sway
 */
export class IdleAnimation {
  private vrm: VRM | null = null;
  private time = 0;
  private blinkTimer = 0;
  private blinkDuration = 0.15;
  private nextBlink = 3;
  private isBlinking = false;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  update(delta: number): void {
    if (!this.vrm) return;

    this.time += delta;

    // Breathing — gentle head bob
    const breathY = Math.sin(this.time * 1.5) * 0.003;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.position.y += breathY;
    }

    // Subtle head sway
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.y = Math.sin(this.time * 0.3) * 0.02;
      neck.rotation.z = Math.sin(this.time * 0.5) * 0.01;
    }

    // Blinking
    this.updateBlink(delta);
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
        this.nextBlink = 2 + Math.random() * 4; // 2-6 seconds
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
