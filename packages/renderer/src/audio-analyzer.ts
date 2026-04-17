import type { BeatFrame } from '@aris/avatar';

/**
 * Loopback audio analyzer.
 *
 * Captures system audio via Electron's desktop getUserMedia path and produces
 * a `BeatFrame` snapshot (bass energy + beat-detected flag) per invocation of
 * `getCurrentFrame()`. The scene's frame loop polls this each tick, so the
 * analyzer runs synchronously on the renderer thread — no IPC or workers.
 *
 * Privacy / consent:
 *   - Must be started explicitly (opt-in), via `start()`.
 *   - If the OS/Electron denies the capture request (no consent, no driver
 *     loopback, etc.), `start()` rejects and the caller should surface a
 *     user-facing error rather than silently retry.
 *   - `stop()` releases the media stream and tears down the AudioContext.
 *
 * Beat detection uses a simple energy-based onset detector on a bass band
 * (40–200 Hz). The long-window baseline (~2 s) is compared to a short-window
 * instant reading; when the instant value exceeds `threshold × baseline`
 * and the last beat was >150 ms ago, we flag a beat. This is intentionally
 * minimal — it works well for percussive music and produces a musical body
 * motion even when onsets are missed (the energy value still drives idle bob).
 */
export class AudioAnalyzer {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBuffer: Uint8Array = new Uint8Array(0);

  /** Running mean bass energy (0..1), long time constant. */
  private baseline = 0;
  /** Last-frame bass energy (0..1). */
  private lastEnergy = 0;
  /** Timestamp of last detected beat (performance.now), 0 if never. */
  private lastBeatAt = 0;
  /** Flag set true on the current frame when a beat was detected; consumed by getCurrentFrame. */
  private beatPending = false;

  /** Beat detection sensitivity — instant must exceed baseline × threshold. */
  private readonly threshold = 1.4;
  /** Minimum gap between beats (ms). */
  private readonly minBeatGap = 150;
  /** Baseline smoothing — 0..1, higher = slower adaptation. */
  private readonly baselineTau = 0.985;

  isRunning(): boolean {
    return this.stream !== null;
  }

  /**
   * Start capturing system audio. Returns a promise that resolves when the
   * stream is active. Rejects if permission is denied or no audio source is
   * available.
   *
   * Electron-specific: chromeMediaSource 'desktop' requests desktop audio
   * loopback. Video must also be requested to unlock audio on Windows per
   * Chromium's rules; we stop the video track immediately after capture.
   */
  async start(): Promise<void> {
    if (this.stream) return;

    // Electron accepts legacy chromeMediaSource constraints for desktop audio.
    // Cast through unknown because lib.dom doesn't type the mandatory field.
    const constraints = {
      audio: {
        mandatory: { chromeMediaSource: 'desktop' },
      },
      video: {
        mandatory: { chromeMediaSource: 'desktop' },
      },
    } as unknown as MediaStreamConstraints;

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Drop the video track immediately — we only need audio.
    for (const track of stream.getVideoTracks()) track.stop();

    this.stream = stream;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    // Do NOT connect analyser to ctx.destination — that would echo audio back
    // through the default output.
    this.analyser = analyser;
    this.freqBuffer = new Uint8Array(analyser.frequencyBinCount);
    this.baseline = 0;
    this.lastEnergy = 0;
    this.lastBeatAt = 0;
  }

  /** Stop capture and release all resources. Safe to call when not running. */
  async stop(): Promise<void> {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore — context may already be closed
      }
      this.ctx = null;
    }
    this.analyser = null;
    this.freqBuffer = new Uint8Array(0);
    this.baseline = 0;
    this.lastEnergy = 0;
    this.lastBeatAt = 0;
  }

  /**
   * Sample the analyser once and return the current beat frame.
   * Returns zero-energy when not running, so callers can poll unconditionally.
   */
  getCurrentFrame(): BeatFrame {
    if (!this.analyser || !this.ctx) {
      return { bassEnergy: 0, beatDetected: false };
    }

    this.analyser.getByteFrequencyData(this.freqBuffer);

    // Map bass band (40-200 Hz) to FFT bin indices for the current sample rate.
    const sampleRate = this.ctx.sampleRate;
    const binHz = sampleRate / this.analyser.fftSize;
    const lowBin = Math.max(1, Math.floor(40 / binHz));
    const highBin = Math.min(this.freqBuffer.length - 1, Math.ceil(200 / binHz));

    let sum = 0;
    let count = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += this.freqBuffer[i];
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    const energy = avg / 255; // 0..1

    // Adapt baseline slowly so a sustained loud section doesn't eat all beats.
    this.baseline = this.baseline * this.baselineTau + energy * (1 - this.baselineTau);

    // Beat detection — instant energy well above baseline and past min-gap.
    const now = performance.now();
    let beatDetected = false;
    // Minimum baseline floor so we don't fire beats in near-silence.
    if (
      this.baseline > 0.02 &&
      energy > this.baseline * this.threshold &&
      energy > this.lastEnergy &&
      now - this.lastBeatAt > this.minBeatGap
    ) {
      beatDetected = true;
      this.lastBeatAt = now;
    }
    this.lastEnergy = energy;

    return { bassEnergy: energy, beatDetected };
  }
}
