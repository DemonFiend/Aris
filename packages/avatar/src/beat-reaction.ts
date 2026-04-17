import type { VRM } from '@pixiv/three-vrm';

/**
 * Per-frame beat frame pushed from the audio analyzer.
 *
 * - `bassEnergy`: smoothed bass-band energy in 0..1. Drives continuous body motion.
 * - `beatDetected`: true on the frame a transient onset is detected. Triggers a head nod.
 */
export interface BeatFrame {
  bassEnergy: number;
  beatDetected: boolean;
}

/**
 * BeatReactionController — avatar reacts to system/game audio.
 *
 * Additive to the idle/pose stack. Call `setBeatFrame()` each time a new
 * audio-analysis frame is available (typically 30-60 Hz), then `update(delta)`
 * in the normal frame loop between `physics.update()` and `surprise.update()`.
 *
 * Energy drives a subtle hip bob and torso pulse scaled by bass level.
 * Detected beats add a short head-nod envelope that decays in ~0.35 s.
 *
 * The controller is a no-op when `setVRM` has not been called or when
 * `setEnabled(false)`. Energy input is ignored (treated as zero) while
 * disabled, so no residual motion leaks through.
 */
export class BeatReactionController {
  private vrm: VRM | null = null;
  private enabled = false;
  private sensitivity = 1.0;

  /** Smoothed 0..1 bass energy used each frame. */
  private energy = 0;
  /** Raw latest energy from analyzer — consumed by update() with additional smoothing. */
  private targetEnergy = 0;

  /** Monotonic clock accumulated from update() deltas. Drives oscillation. */
  private clock = 0;

  /** Time remaining in the current head-nod envelope. */
  private nodTimer = 0;
  /** Full duration of the current head-nod envelope. */
  private nodDuration = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.reset();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  setSensitivity(sensitivity: number): void {
    // Clamp to a safe range so external config can't produce extreme motion.
    this.sensitivity = Math.max(0, Math.min(2, sensitivity));
  }

  isActive(): boolean {
    return this.enabled && (this.energy > 0.01 || this.nodTimer > 0);
  }

  /**
   * Push a new audio-analysis frame. Safe to call at any rate — the controller
   * smooths the energy value internally and treats `beatDetected` as an impulse.
   */
  setBeatFrame(frame: BeatFrame): void {
    if (!this.enabled) return;
    this.targetEnergy = Math.max(0, Math.min(1, frame.bassEnergy));
    if (frame.beatDetected && this.nodTimer <= 0) {
      // Short nod envelope — scales with current energy so quiet beats are subtle.
      this.nodDuration = 0.35;
      this.nodTimer = this.nodDuration;
    }
  }

  /** Called every frame from the avatar scene loop. */
  update(delta: number): void {
    if (!this.vrm || !this.enabled) return;

    this.clock += delta;

    // Smooth toward target energy. Attack faster than decay so body "pops"
    // with beats, then settles gently when the music quiets down.
    const attack = 8.0; // per second — ~125 ms to reach target
    const decay = 3.0;  // per second — ~330 ms to settle
    const rate = this.targetEnergy > this.energy ? attack : decay;
    const k = Math.min(1, rate * delta);
    this.energy += (this.targetEnergy - this.energy) * k;

    if (this.nodTimer > 0) {
      this.nodTimer = Math.max(0, this.nodTimer - delta);
    }

    const s = this.sensitivity;
    if (s <= 0 || this.energy <= 0.005) {
      // Clear nod-only path: still apply nod even if energy is tiny, so beats
      // are visible under near-silent tracks.
      if (this.nodTimer > 0) this.applyHeadNod(s);
      return;
    }

    this.applyHipBob(s);
    this.applyTorsoPulse(s);
    if (this.nodTimer > 0) this.applyHeadNod(s);
  }

  private reset(): void {
    this.energy = 0;
    this.targetEnergy = 0;
    this.nodTimer = 0;
    this.nodDuration = 0;
    this.clock = 0;
  }

  // -------------------------------------------------------------------------
  // Motion application (additive bone offsets)
  // -------------------------------------------------------------------------

  /**
   * Hip bob — vertical dip + slight roll, paced by a ~2 Hz carrier.
   * The carrier gives a musical feel even when `beatDetected` is false
   * (e.g., for tracks where onset detection is unreliable).
   */
  private applyHipBob(s: number): void {
    const hips = this.vrm!.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    const e = this.energy;
    // 2 Hz carrier — musical default tempo feel (~120 BPM).
    const phase = this.clock * 2 * Math.PI * 2;
    const bob = Math.sin(phase);
    // Dip on the downbeat — negative Y scaled by energy.
    hips.position.y += -Math.abs(bob) * 0.015 * e * s;
    // Subtle roll on the eighth-note offbeat.
    hips.rotation.z += Math.sin(phase * 0.5) * 0.02 * e * s;
  }

  /** Torso/chest pulse — tightens the "breathing with the music" feel. */
  private applyTorsoPulse(s: number): void {
    const chest = this.vrm!.humanoid?.getNormalizedBoneNode('chest');
    const spine = this.vrm!.humanoid?.getNormalizedBoneNode('spine');
    const e = this.energy;
    const phase = this.clock * 2 * Math.PI * 2;
    const pulse = (Math.sin(phase) + 1) * 0.5; // 0..1
    if (chest) chest.rotation.x += pulse * 0.015 * e * s;
    if (spine) spine.rotation.x += pulse * 0.010 * e * s;
  }

  /**
   * Head nod — decaying envelope triggered on each beat.
   * Amplitude scales with current energy so quiet beats don't whiplash.
   */
  private applyHeadNod(s: number): void {
    if (this.nodDuration <= 0) return;
    const head = this.vrm!.humanoid?.getNormalizedBoneNode('head');
    if (!head) return;
    const t = this.nodTimer / this.nodDuration; // 1 → 0
    // Half-sine envelope: starts at 0, peaks mid-envelope, returns to 0.
    const envelope = Math.sin((1 - t) * Math.PI);
    const amp = 0.08 * Math.max(0.3, this.energy) * s;
    // Positive X rotation = chin toward chest (nod down).
    head.rotation.x += envelope * amp;
  }
}
