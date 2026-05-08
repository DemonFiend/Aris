import * as THREE from 'three';

/**
 * Canonical camera framings supported by the Camera Viewer.
 *
 * Per ARI-168 plan §3.3, the viewer ships three modes for the minimum-viable
 * lane. The legacy `'portrait'` value is still accepted on input (mapped to
 * `'upper_torso'`) but no longer appears in the canonical union.
 */
export type CameraMode = 'headshot' | 'upper_torso' | 'fullbody';

/** Input type for {@link CameraController.setMode} — accepts the legacy `'portrait'` alias. */
export type CameraModeInput = CameraMode | 'portrait';

// Pose constants — exact values from ARI-168 plan §4.
const HEADSHOT_POSITION = new THREE.Vector3(0, 1.55, 0.65);
const HEADSHOT_TARGET = new THREE.Vector3(0, 1.5, 0);
const HEADSHOT_FOV = 22;

// Upper-torso pose preserves the legacy `'portrait'` numbers verbatim
// so existing callers that send `'portrait'` see no behavioural change.
const UPPER_TORSO_POSITION = new THREE.Vector3(0, 1.4, 1.5);
const UPPER_TORSO_TARGET = new THREE.Vector3(0, 1.3, 0);

const FULLBODY_POSITION = new THREE.Vector3(0, 2.0, 4.5);
const FULLBODY_TARGET = new THREE.Vector3(0, 0.9, 0);

/** FOV used for non-headshot modes; matches the existing PerspectiveCamera default. */
const DEFAULT_FOV = 30;

/** Transition duration in seconds — unchanged from the original portrait/fullbody behaviour. */
export const CAMERA_TRANSITION_DURATION_S = 0.75;

export interface CameraPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
}

/** Resolve a canonical {@link CameraMode} to its position/target/FOV literals. */
export function getCameraPose(mode: CameraMode): CameraPose {
  switch (mode) {
    case 'headshot':
      return { position: HEADSHOT_POSITION, target: HEADSHOT_TARGET, fov: HEADSHOT_FOV };
    case 'upper_torso':
      return { position: UPPER_TORSO_POSITION, target: UPPER_TORSO_TARGET, fov: DEFAULT_FOV };
    case 'fullbody':
      return { position: FULLBODY_POSITION, target: FULLBODY_TARGET, fov: DEFAULT_FOV };
  }
}

/** Map any accepted input (incl. legacy `'portrait'`) to a canonical mode. */
export function normalizeCameraMode(mode: CameraModeInput): CameraMode {
  return mode === 'portrait' ? 'upper_torso' : mode;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'upper_torso';

  private fromPosition = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private fromFov = DEFAULT_FOV;
  private toPosition = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private toFov = DEFAULT_FOV;
  private currentTarget = new THREE.Vector3();
  private transitioning = false;
  private progress = 1;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    const initial = getCameraPose(this.mode);
    this.camera.position.copy(initial.position);
    this.currentTarget.copy(initial.target);
    this.camera.fov = initial.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentTarget);
  }

  setMode(mode: CameraModeInput): void {
    const canonical = normalizeCameraMode(mode);
    if (canonical === this.mode && !this.transitioning) return;
    const pose = getCameraPose(canonical);
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.currentTarget);
    this.fromFov = this.camera.fov;
    this.toPosition.copy(pose.position);
    this.toTarget.copy(pose.target);
    this.toFov = pose.fov;
    this.mode = canonical;
    this.progress = 0;
    this.transitioning = true;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  /** Current look-at target (post-interpolation). Exposed for diagnostics/tests. */
  getCurrentTarget(): THREE.Vector3 {
    return this.currentTarget.clone();
  }

  update(delta: number): void {
    if (!this.transitioning) return;
    this.progress = Math.min(1, this.progress + delta / CAMERA_TRANSITION_DURATION_S);
    // Ease in-out cubic
    const t =
      this.progress < 0.5
        ? 4 * this.progress * this.progress * this.progress
        : 1 - Math.pow(-2 * this.progress + 2, 3) / 2;

    this.camera.position.lerpVectors(this.fromPosition, this.toPosition, t);
    this.currentTarget.lerpVectors(this.fromTarget, this.toTarget, t);
    const nextFov = this.fromFov + (this.toFov - this.fromFov) * t;
    if (this.camera.fov !== nextFov) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.currentTarget);

    if (this.progress >= 1) {
      this.transitioning = false;
    }
  }
}
