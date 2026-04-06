import type { VRM } from '@pixiv/three-vrm';

/**
 * Idle animation controller that adds subtle life to the avatar:
 * - Breathing (slight head bob)
 * - Blinking at random intervals
 * - Subtle head sway
 */
export interface IdleConfig {
  breathingIntensity: number;
  swayIntensity: number;
  blinkFrequency: number;
}

export class IdleAnimation {
  private vrm: VRM | null = null;
  private time = 0;
  private blinkTimer = 0;
  private blinkDuration = 0.15;
  private nextBlink = 3;
  private isBlinking = false;
  private config: IdleConfig = { breathingIntensity: 1, swayIntensity: 1, blinkFrequency: 4 };

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  setConfig(config: Partial<IdleConfig>): void {
    Object.assign(this.config, config);
  }

  update(delta: number): void {
    if (!this.vrm) return;

    this.time += delta;

    // Breathing — gentle head bob (scaled by config)
    const breathY = Math.sin(this.time * 1.5) * 0.003 * this.config.breathingIntensity;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.position.y += breathY;
    }

    // Subtle head sway (scaled by config)
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.y = Math.sin(this.time * 0.3) * 0.02 * this.config.swayIntensity;
      neck.rotation.z = Math.sin(this.time * 0.5) * 0.01 * this.config.swayIntensity;
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
        // Blink interval varies around configured frequency
        const half = this.config.blinkFrequency * 0.5;
        this.nextBlink = this.config.blinkFrequency - half + Math.random() * half * 2;
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
