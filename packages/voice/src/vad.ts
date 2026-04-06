/**
 * Simple volume-based Voice Activity Detection using Web Audio API.
 * Must be instantiated in the renderer process.
 */
export class VolumeVAD {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private threshold: number;

  onSpeechStart: (() => void) | null = null;
  onSpeechEnd: (() => void) | null = null;
  onVolumeChange: ((volume: number) => void) | null = null;

  private isSpeaking = false;
  private silenceFrames = 0;
  private readonly silenceDelay = 10; // ~500ms at 50ms poll

  constructor(threshold = 0.02) {
    this.threshold = threshold;
  }

  async start(): Promise<void> {
    if (this.active) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;

    const source = this.audioContext.createMediaStreamSource(this.stream);
    source.connect(this.analyser);

    this.active = true;
    this.pollVolume();
  }

  stop(): void {
    this.active = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.isSpeaking = false;
    this.silenceFrames = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  private pollVolume(): void {
    if (!this.analyser) return;

    const dataArray = new Float32Array(this.analyser.fftSize);

    this.interval = setInterval(() => {
      if (!this.analyser) return;

      this.analyser.getFloatTimeDomainData(dataArray);

      // RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const volume = Math.sqrt(sum / dataArray.length);

      this.onVolumeChange?.(volume);

      if (volume > this.threshold) {
        this.silenceFrames = 0;
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.onSpeechStart?.();
        }
      } else {
        this.silenceFrames++;
        if (this.isSpeaking && this.silenceFrames >= this.silenceDelay) {
          this.isSpeaking = false;
          this.onSpeechEnd?.();
        }
      }
    }, 50);
  }
}
