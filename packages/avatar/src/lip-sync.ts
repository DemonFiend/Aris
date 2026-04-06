import type { VRM } from '@pixiv/three-vrm';

/**
 * Lip sync controller that maps audio volume to VRM mouth blend shapes.
 * Analyzes audio output volume and drives the 'aa' (mouth open) blend shape.
 */
export class LipSync {
  private vrm: VRM | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private active = false;
  private currentOpenness = 0;
  private smoothing = 0.3;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  /**
   * Connect to an audio element or media stream for lip sync analysis.
   */
  connectToAudio(source: HTMLAudioElement | MediaStream): void {
    this.disconnect();

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;

    let sourceNode: AudioNode;
    if (source instanceof HTMLAudioElement) {
      sourceNode = this.audioContext.createMediaElementSource(source);
      sourceNode.connect(this.audioContext.destination);
    } else {
      sourceNode = this.audioContext.createMediaStreamSource(source);
    }
    sourceNode.connect(this.analyser);
    this.active = true;
  }

  disconnect(): void {
    this.active = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  }

  /**
   * Set speaking state directly (for when no audio analysis is available).
   * Simulates lip movement from speaking cadence.
   */
  setSpeaking(speaking: boolean): void {
    if (!speaking) {
      this.currentOpenness = 0;
      this.applyMouth(0);
    }
    this.active = speaking;
  }

  update(delta: number): void {
    if (!this.vrm?.expressionManager) return;

    if (this.active && this.analyser) {
      // Audio-driven lip sync
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);

      // Use low-mid frequencies for voice
      let sum = 0;
      const voiceBins = Math.min(32, dataArray.length);
      for (let i = 0; i < voiceBins; i++) {
        sum += dataArray[i];
      }
      const average = sum / voiceBins / 255;
      const targetOpenness = Math.min(1.0, average * 2.5);

      this.currentOpenness += (targetOpenness - this.currentOpenness) * this.smoothing;
      this.applyMouth(this.currentOpenness);
    } else if (this.active) {
      // Simulated lip sync when no audio source
      const time = performance.now() / 1000;
      const simulated = (Math.sin(time * 8) * 0.3 + 0.3) * 0.6;
      this.currentOpenness += (simulated - this.currentOpenness) * this.smoothing;
      this.applyMouth(this.currentOpenness);
    } else {
      // Gradually close mouth
      if (this.currentOpenness > 0.01) {
        this.currentOpenness *= 0.85;
        this.applyMouth(this.currentOpenness);
      }
    }
  }

  private applyMouth(openness: number): void {
    if (!this.vrm?.expressionManager) return;
    this.vrm.expressionManager.setValue('aa', openness);
  }
}
