import type { VRM } from '@pixiv/three-vrm';

export type GestureType =
  | 'wave'
  | 'nod'
  | 'shake'
  | 'shrug'
  | 'point'
  | 'celebrate'
  | 'facepalm'
  | 'thinking-pose'
  | 'clap'
  | 'crossed-arms'
  | 'bow'
  | 'peace-sign'
  | 'salute'
  | 'dance-loop'
  | 'sneeze';

interface Keyframe {
  time: number;
  bone: string;
  axis: 'x' | 'y' | 'z';
  value: number;
}

interface GestureDef {
  duration: number;
  loop?: boolean;
  keyframes: Keyframe[];
}

const GESTURE_KEYFRAMES: Record<GestureType, GestureDef> = {
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

  celebrate: {
    duration: 1.5,
    keyframes: [
      // Both arms pump up in celebration
      { time: 0.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.2, bone: 'leftUpperArm', axis: 'z', value: 1.4 },
      { time: 0.2, bone: 'rightUpperArm', axis: 'z', value: -1.4 },
      { time: 0.5, bone: 'leftUpperArm', axis: 'z', value: 1.2 },
      { time: 0.5, bone: 'rightUpperArm', axis: 'z', value: -1.2 },
      { time: 0.7, bone: 'leftUpperArm', axis: 'z', value: 1.5 },
      { time: 0.7, bone: 'rightUpperArm', axis: 'z', value: -1.5 },
      { time: 1.1, bone: 'leftUpperArm', axis: 'z', value: 1.5 },
      { time: 1.1, bone: 'rightUpperArm', axis: 'z', value: -1.5 },
      { time: 1.5, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 1.5, bone: 'rightUpperArm', axis: 'z', value: 0 },
      // Slight head lift
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.3, bone: 'head', axis: 'x', value: -0.1 },
      { time: 1.1, bone: 'head', axis: 'x', value: -0.1 },
      { time: 1.5, bone: 'head', axis: 'x', value: 0 },
    ],
  },

  facepalm: {
    duration: 1.4,
    keyframes: [
      // Right hand rises to face level
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.0, bone: 'rightLowerArm', axis: 'x', value: 0 },
      { time: 0.3, bone: 'rightUpperArm', axis: 'z', value: -0.7 },
      { time: 0.3, bone: 'rightUpperArm', axis: 'x', value: 0.4 },
      { time: 0.3, bone: 'rightLowerArm', axis: 'x', value: 0.5 },
      { time: 0.9, bone: 'rightUpperArm', axis: 'z', value: -0.7 },
      { time: 0.9, bone: 'rightUpperArm', axis: 'x', value: 0.4 },
      { time: 0.9, bone: 'rightLowerArm', axis: 'x', value: 0.5 },
      { time: 1.4, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.4, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 1.4, bone: 'rightLowerArm', axis: 'x', value: 0 },
      // Head tilts slightly down in despair
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.4, bone: 'head', axis: 'x', value: 0.12 },
      { time: 1.0, bone: 'head', axis: 'x', value: 0.12 },
      { time: 1.4, bone: 'head', axis: 'x', value: 0 },
    ],
  },

  'thinking-pose': {
    duration: 1.8,
    keyframes: [
      // Right arm up, hand near chin area
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.0, bone: 'rightLowerArm', axis: 'y', value: 0 },
      { time: 0.35, bone: 'rightUpperArm', axis: 'z', value: -0.55 },
      { time: 0.35, bone: 'rightUpperArm', axis: 'x', value: 0.3 },
      { time: 0.35, bone: 'rightLowerArm', axis: 'y', value: -0.7 },
      { time: 1.3, bone: 'rightUpperArm', axis: 'z', value: -0.55 },
      { time: 1.3, bone: 'rightUpperArm', axis: 'x', value: 0.3 },
      { time: 1.3, bone: 'rightLowerArm', axis: 'y', value: -0.7 },
      { time: 1.8, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.8, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 1.8, bone: 'rightLowerArm', axis: 'y', value: 0 },
      // Head tilts as if pondering
      { time: 0.0, bone: 'head', axis: 'y', value: 0 },
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.4, bone: 'head', axis: 'y', value: 0.1 },
      { time: 0.4, bone: 'head', axis: 'x', value: 0.06 },
      { time: 1.3, bone: 'head', axis: 'y', value: 0.1 },
      { time: 1.3, bone: 'head', axis: 'x', value: 0.06 },
      { time: 1.8, bone: 'head', axis: 'y', value: 0 },
      { time: 1.8, bone: 'head', axis: 'x', value: 0 },
    ],
  },

  clap: {
    duration: 1.2,
    keyframes: [
      // Arms swing in and out for a clapping motion
      { time: 0.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'leftLowerArm', axis: 'y', value: 0 },
      { time: 0.0, bone: 'rightLowerArm', axis: 'y', value: 0 },
      // First clap — arms in
      { time: 0.2, bone: 'leftUpperArm', axis: 'z', value: 0.75 },
      { time: 0.2, bone: 'rightUpperArm', axis: 'z', value: -0.75 },
      { time: 0.2, bone: 'leftLowerArm', axis: 'y', value: 0.5 },
      { time: 0.2, bone: 'rightLowerArm', axis: 'y', value: -0.5 },
      // Rebound out slightly
      { time: 0.4, bone: 'leftUpperArm', axis: 'z', value: 0.5 },
      { time: 0.4, bone: 'rightUpperArm', axis: 'z', value: -0.5 },
      { time: 0.4, bone: 'leftLowerArm', axis: 'y', value: 0.3 },
      { time: 0.4, bone: 'rightLowerArm', axis: 'y', value: -0.3 },
      // Second clap
      { time: 0.6, bone: 'leftUpperArm', axis: 'z', value: 0.75 },
      { time: 0.6, bone: 'rightUpperArm', axis: 'z', value: -0.75 },
      { time: 0.6, bone: 'leftLowerArm', axis: 'y', value: 0.5 },
      { time: 0.6, bone: 'rightLowerArm', axis: 'y', value: -0.5 },
      // Return
      { time: 1.2, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 1.2, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.2, bone: 'leftLowerArm', axis: 'y', value: 0 },
      { time: 1.2, bone: 'rightLowerArm', axis: 'y', value: 0 },
    ],
  },

  'crossed-arms': {
    duration: 1.4,
    keyframes: [
      // Arms cross over the chest
      { time: 0.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'leftUpperArm', axis: 'x', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.35, bone: 'leftUpperArm', axis: 'z', value: 0.65 },
      { time: 0.35, bone: 'rightUpperArm', axis: 'z', value: -0.65 },
      { time: 0.35, bone: 'leftUpperArm', axis: 'x', value: -0.45 },
      { time: 0.35, bone: 'rightUpperArm', axis: 'x', value: -0.45 },
      { time: 1.0, bone: 'leftUpperArm', axis: 'z', value: 0.65 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'z', value: -0.65 },
      { time: 1.0, bone: 'leftUpperArm', axis: 'x', value: -0.45 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'x', value: -0.45 },
      { time: 1.4, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 1.4, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.4, bone: 'leftUpperArm', axis: 'x', value: 0 },
      { time: 1.4, bone: 'rightUpperArm', axis: 'x', value: 0 },
    ],
  },

  bow: {
    duration: 1.6,
    keyframes: [
      // Head and neck bow forward
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.0, bone: 'neck', axis: 'x', value: 0 },
      { time: 0.4, bone: 'head', axis: 'x', value: 0.35 },
      { time: 0.4, bone: 'neck', axis: 'x', value: 0.2 },
      { time: 1.0, bone: 'head', axis: 'x', value: 0.35 },
      { time: 1.0, bone: 'neck', axis: 'x', value: 0.2 },
      { time: 1.6, bone: 'head', axis: 'x', value: 0 },
      { time: 1.6, bone: 'neck', axis: 'x', value: 0 },
    ],
  },

  'peace-sign': {
    duration: 1.2,
    keyframes: [
      // Right arm raises with peace gesture
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.25, bone: 'rightUpperArm', axis: 'z', value: -1.0 },
      { time: 0.25, bone: 'rightUpperArm', axis: 'x', value: -0.15 },
      { time: 0.85, bone: 'rightUpperArm', axis: 'z', value: -1.0 },
      { time: 0.85, bone: 'rightUpperArm', axis: 'x', value: -0.15 },
      { time: 1.2, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.2, bone: 'rightUpperArm', axis: 'x', value: 0 },
      // Small head tilt to accompany the gesture
      { time: 0.0, bone: 'head', axis: 'z', value: 0 },
      { time: 0.3, bone: 'head', axis: 'z', value: -0.08 },
      { time: 0.85, bone: 'head', axis: 'z', value: -0.08 },
      { time: 1.2, bone: 'head', axis: 'z', value: 0 },
    ],
  },

  salute: {
    duration: 1.1,
    keyframes: [
      // Right hand raises to forehead
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 0.0, bone: 'rightLowerArm', axis: 'y', value: 0 },
      { time: 0.25, bone: 'rightUpperArm', axis: 'z', value: -0.8 },
      { time: 0.25, bone: 'rightUpperArm', axis: 'x', value: 0.25 },
      { time: 0.25, bone: 'rightLowerArm', axis: 'y', value: -0.35 },
      { time: 0.75, bone: 'rightUpperArm', axis: 'z', value: -0.8 },
      { time: 0.75, bone: 'rightUpperArm', axis: 'x', value: 0.25 },
      { time: 0.75, bone: 'rightLowerArm', axis: 'y', value: -0.35 },
      { time: 1.1, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.1, bone: 'rightUpperArm', axis: 'x', value: 0 },
      { time: 1.1, bone: 'rightLowerArm', axis: 'y', value: 0 },
      // Slight head lift during salute
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.3, bone: 'head', axis: 'x', value: -0.05 },
      { time: 0.75, bone: 'head', axis: 'x', value: -0.05 },
      { time: 1.1, bone: 'head', axis: 'x', value: 0 },
    ],
  },

  'dance-loop': {
    duration: 2.0,
    loop: true,
    keyframes: [
      // Hips sway side to side
      { time: 0.0, bone: 'hips', axis: 'y', value: 0 },
      { time: 0.5, bone: 'hips', axis: 'y', value: 0.1 },
      { time: 1.0, bone: 'hips', axis: 'y', value: 0 },
      { time: 1.5, bone: 'hips', axis: 'y', value: -0.1 },
      { time: 2.0, bone: 'hips', axis: 'y', value: 0 },
      // Arms sway in counterpoint
      { time: 0.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 0.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 0.5, bone: 'leftUpperArm', axis: 'z', value: 0.3 },
      { time: 0.5, bone: 'rightUpperArm', axis: 'z', value: -0.15 },
      { time: 1.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 1.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      { time: 1.5, bone: 'leftUpperArm', axis: 'z', value: 0.15 },
      { time: 1.5, bone: 'rightUpperArm', axis: 'z', value: -0.3 },
      { time: 2.0, bone: 'leftUpperArm', axis: 'z', value: 0 },
      { time: 2.0, bone: 'rightUpperArm', axis: 'z', value: 0 },
      // Head bobs with the beat
      { time: 0.0, bone: 'head', axis: 'x', value: 0 },
      { time: 0.25, bone: 'head', axis: 'x', value: 0.05 },
      { time: 0.5, bone: 'head', axis: 'x', value: 0 },
      { time: 0.75, bone: 'head', axis: 'x', value: 0.05 },
      { time: 1.0, bone: 'head', axis: 'x', value: 0 },
      { time: 1.25, bone: 'head', axis: 'x', value: 0.05 },
      { time: 1.5, bone: 'head', axis: 'x', value: 0 },
      { time: 1.75, bone: 'head', axis: 'x', value: 0.05 },
      { time: 2.0, bone: 'head', axis: 'x', value: 0 },
    ],
  },
  sneeze: {
    duration: 1.0,
    keyframes: [
      // Wind-up: head tilts back
      { time: 0.0,  bone: 'head', axis: 'x', value: 0 },
      { time: 0.15, bone: 'head', axis: 'x', value: -0.12 },
      { time: 0.3,  bone: 'head', axis: 'x', value: -0.2 },
      // Snap: head jerks forward
      { time: 0.45, bone: 'head', axis: 'x', value: 0.35 },
      // Bounce and settle
      { time: 0.6,  bone: 'head', axis: 'x', value: 0.1 },
      { time: 0.75, bone: 'head', axis: 'x', value: 0.05 },
      { time: 1.0,  bone: 'head', axis: 'x', value: 0 },
      // Slight spine engagement
      { time: 0.0,  bone: 'spine', axis: 'x', value: 0 },
      { time: 0.45, bone: 'spine', axis: 'x', value: 0.08 },
      { time: 1.0,  bone: 'spine', axis: 'x', value: 0 },
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
  private loop = false;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  play(gesture: GestureType): void {
    if (!this.vrm) return;
    const def = GESTURE_KEYFRAMES[gesture];
    this.playing = gesture;
    this.elapsed = 0;
    this.duration = def.duration;
    this.loop = def.loop ?? false;
  }

  stop(): void {
    this.playing = null;
  }

  isPlaying(): boolean {
    return this.playing !== null;
  }

  update(delta: number): void {
    if (!this.vrm || !this.playing) return;

    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      if (this.loop) {
        // Reset elapsed to continue looping
        this.elapsed = this.elapsed % this.duration;
      } else {
        this.applyAtTime(this.duration);
        this.playing = null;
        return;
      }
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
