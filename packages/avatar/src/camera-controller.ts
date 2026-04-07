import * as THREE from 'three';

export type CameraMode = 'portrait' | 'fullbody';

const PORTRAIT_POSITION = new THREE.Vector3(0, 1.4, 1.5);
const PORTRAIT_TARGET = new THREE.Vector3(0, 1.3, 0);
const FULLBODY_POSITION = new THREE.Vector3(0, 2.0, 4.5);
const FULLBODY_TARGET = new THREE.Vector3(0, 0.9, 0);

const TRANSITION_DURATION = 0.75; // seconds

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'portrait';

  private fromPosition = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private toPosition = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private currentTarget = new THREE.Vector3();
  private transitioning = false;
  private progress = 1;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.copy(PORTRAIT_POSITION);
    this.currentTarget.copy(PORTRAIT_TARGET);
    this.camera.lookAt(this.currentTarget);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode && !this.transitioning) return;
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.currentTarget);
    this.toPosition.copy(mode === 'portrait' ? PORTRAIT_POSITION : FULLBODY_POSITION);
    this.toTarget.copy(mode === 'portrait' ? PORTRAIT_TARGET : FULLBODY_TARGET);
    this.mode = mode;
    this.progress = 0;
    this.transitioning = true;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  update(delta: number): void {
    if (!this.transitioning) return;
    this.progress = Math.min(1, this.progress + delta / TRANSITION_DURATION);
    // Ease in-out cubic
    const t =
      this.progress < 0.5
        ? 4 * this.progress * this.progress * this.progress
        : 1 - Math.pow(-2 * this.progress + 2, 3) / 2;

    this.camera.position.lerpVectors(this.fromPosition, this.toPosition, t);
    this.currentTarget.lerpVectors(this.fromTarget, this.toTarget, t);
    this.camera.lookAt(this.currentTarget);

    if (this.progress >= 1) {
      this.transitioning = false;
    }
  }
}
