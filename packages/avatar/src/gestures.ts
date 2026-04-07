import type { VRM } from '@pixiv/three-vrm';

export type GestureType = 'wave' | 'nod' | 'shake' | 'shrug' | 'point';

interface Keyframe {
  time: number;
  bone: string;
  axis: 'x' | 'y' | 'z';
  value: number;
}

const GESTURE_KEYFRAMES: Record<GestureType, { duration: number; keyframes: Keyframe[] }> = {
  wave: {
    duration: 1.2,
    keyframes: [
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.15, bone: 'rightUpperArm', axis: 'z', value: -1.2 },
      { time: 0.3, bone: 'rightLowerArm', axis: 'z', value: -0.3 },
      { time: 0.45, bone: 'rightHand', axis: 'z', value: 0.4 },
      { time: 0.6, bone: 'rightHand', axis: 'z', value: -0.4 },
      { time: 0.75, bone: 'rightHand', axis: 'z', value: 0.4 },
      { time: 0.9, bone: 'rightHand', axis: 'z', value: -0.4 },
      { time: 1.05, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.2, bone: 'rightLowerArm', axis: 'z', value: 0 },
    ],
  },
  nod: {
    duration: 0.8,
    keyframes: [
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.2, bone: 'head', axis: 'x', value: 0.2 },
      { time: 0.4, bone: 'head', axis: 'x', value: -0.05 },
      { time: 0.6, bone: 'head', axis: 'x', value: 0.15 },
      { time: 0.8, bone: 'head', axis: 'x', value: 0 },
    ],
  },
  shake: {
    duration: 0.8,
    keyframes: [
      { time: 0.0, bone: 'head', axis: 'y', value: 0 },
      { time: 0.15, bone: 'head', axis: 'y', value: 0.2 },
      { time: 0.3, bone: 'head', axis: 'y', value: -0.2 },
      { time: 0.45, bone: 'head', axis: 'y', value: 0.15 },
      { time: 0.6, bone: 'head', axis: 'y', value: -0.15 },
      { time: 0.8, bone: 'head', axis: 'y', value: 0 },
    ],
  },
  shrug: {
    duration: 1.0,
    keyframes: [
      { time: 0.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'leftShoulder', axis: 'y', value: 0 },
      { time: 0.0, bone: 'rightShoulder', axis: 'y', value: 0 },
      { time: 0.25, bone: 'leftUpperArm', axis: 'z', value: 0.3 },
      { time: 0.25, bone: 'rightUpperArm', axis: 'z', value: -0.3 },
      { time: 0.25, bone: 'leftShoulder', axis: 'y', value: 0.1 },
      { time: 0.25, bone: 'rightShoulder', axis: 'y', value: -0.1 },
      { time: 0.7, bone: 'leftUpperArm', axis: 'z', value: 0.3 },
      { time: 0.7, bone: 'rightUpperArm', axis: 'z', value: -0.3 },
      { time: 1.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.0, bone: 'leftShoulder', axis: 'y', value: 0 },
      { time: 1.0, bone: 'rightShoulder', axis: 'y', value: 0 },
    ],
  },
  point: {
    duration: 1.0,
    keyframes: [
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.3, bone: 'rightUpperArm', axis: 'z', value: -0.8 },
      { time: 0.3, bone: 'rightUpperArm', axis: 'x', value: -0.3 },
      { time: 0.7, bone: 'rightUpperArm', axis: 'z', value: -0.8 },
      { time: 0.7, bone: 'rightUpperArm', axis: 'x', value: -0.3 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
    ],
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class GestureController {
  private vrm: VRM | null = null;
  private playing: GestureType | null = null;
  private elapsed = 0;
  private duration = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  play(gesture: GestureType): void {
    if (!this.vrm) return;
    const def = GESTURE_KEYFRAMES[gesture];
    this.playing = gesture;
    this.elapsed = 0;
    this.duration = def.duration;
  }

  isPlaying(): boolean {
    return this.playing !== null;
  }

  update(delta: number): void {
    if (!this.vrm || !this.playing) return;

    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      this.applyAtTime(this.duration);
      this.playing = null;
      return;
    }

    this.applyAtTime(this.elapsed);
  }

  private applyAtTime(time: number): void {
    if (!this.vrm || !this.playing) return;

    const { keyframes } = GESTURE_KEYFRAMES[this.playing];

    // Group keyframes by bone+axis
    const tracks = new Map<string, Keyframe[]>();
    for (const kf of keyframes) {
      const key = `${kf.bone}.${kf.axis}`;
      if (!tracks.has(key)) tracks.set(key, []);
      tracks.get(key)!.push(kf);
    }

    for (const [, track] of tracks) {
      // Find surrounding keyframes
      let prev = track[0];
      let next = track[track.length - 1];
      for (let i = 0; i < track.length - 1; i++) {
        if (track[i].time <= time && track[i + 1].time >= time) {
          prev = track[i];
          next = track[i + 1];
          break;
        }
      }

      const span = next.time - prev.time;
      const t = span > 0 ? (time - prev.time) / span : 1;
      // Smooth step easing
      const eased = t * t * (3 - 2 * t);
      const value = lerp(prev.value, next.value, eased);

      const bone = this.vrm.humanoid?.getNormalizedBoneNode(prev.bone as any);
      if (bone) {
        bone.rotation[prev.axis] += value;
      }
    }
  }
}
