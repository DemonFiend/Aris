import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import type { VirtualSpaceConfig } from '@aris/shared';
import { CameraController } from './camera-controller';
import type { CameraMode } from './camera-controller';

export class AvatarScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private clock = new THREE.Clock();
  private animationId: number | null = null;
  private vrm: VRM | null = null;
  private onFrameCallbacks: Array<(delta: number) => void> = [];
  private directionalLight: THREE.DirectionalLight;
  private groundGroup: THREE.Group | null = null;
  private spaceEnabled = false;
  private cameraController: CameraController;

  constructor(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();

    // Camera — managed by CameraController (default: portrait framing)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.cameraController = new CameraController(this.camera);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(1, 2, 3);
    this.scene.add(this.directionalLight);

    const rim = new THREE.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-1, 1, -2);
    this.scene.add(rim);
  }

  async loadVRM(url: string): Promise<VRM> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    // Use fetch() + parse() instead of load() because Three.js's FileLoader
    // uses XHR internally, which doesn't work with Electron custom protocols.
    // The avatar:// protocol only supports the fetch API.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch VRM: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    return new Promise((resolve, reject) => {
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            reject(new Error('No VRM data in model'));
            return;
          }

          // Remove old model
          if (this.vrm) {
            this.scene.remove(this.vrm.scene);
          }

          // Combine skeletons for proper skinned-mesh bounds
          VRMUtils.combineSkeletons(gltf.scene);

          // Disable frustum culling on all VRM objects — skinned meshes
          // have rest-pose bounding volumes that cause incorrect culling
          vrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
          });

          this.vrm = vrm;
          this.scene.add(vrm.scene);

          // Rotate model to face camera
          vrm.scene.rotation.y = Math.PI;

          // Apply shadow casting if virtual space is already active
          if (this.spaceEnabled) {
            vrm.scene.traverse((obj) => {
              if (obj instanceof THREE.Mesh) obj.castShadow = true;
            });
          }

          resolve(vrm);
        },
        (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
      );
    });
  }

  getVRM(): VRM | null {
    return this.vrm;
  }

  /** Render a simple procedural ghost when no VRM is available */
  loadGhostFallback(): void {
    // Ghost body — rounded capsule shape
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.35, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xccccff,
      transparent: true,
      opacity: 0.7,
      emissive: 0x4444aa,
      emissiveIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 1.3, 0);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.07, 1.38, 0.17);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.07, 1.38, 0.17);

    const group = new THREE.Group();
    group.add(body, leftEye, rightEye);

    this.scene.add(group);

    // Gentle floating animation
    let time = 0;
    this.onFrame((delta) => {
      time += delta;
      group.position.y = Math.sin(time * 1.5) * 0.03;
      group.rotation.y = Math.sin(time * 0.5) * 0.1;
    });
  }

  /** Apply virtual space configuration — ground plane, shadows, and background */
  applySpaceConfig(config: VirtualSpaceConfig): void {
    this.spaceEnabled = config.enabled;

    // Remove existing ground group and dispose its resources
    if (this.groundGroup) {
      this.scene.remove(this.groundGroup);
      this.groundGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            (mat as THREE.Material).dispose();
          }
        }
      });
      this.groundGroup = null;
    }

    // Switch camera mode to match space state
    this.cameraController.setMode(config.enabled ? 'fullbody' : 'portrait');

    if (!config.enabled) {
      this.scene.background = null;
      this.scene.fog = null;
      this.renderer.shadowMap.enabled = false;
      this.directionalLight.castShadow = false;
      if (this.vrm) {
        this.vrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.castShadow = false;
        });
      }
      return;
    }

    // Enable shadow mapping
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(1024, 1024);

    // Make VRM cast shadows (only avatar)
    if (this.vrm) {
      this.vrm.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.castShadow = true;
      });
    }

    // Create ground plane
    const [w, h] = config.groundSize;
    const geo = new THREE.PlaneGeometry(w, h);
    let mat: THREE.MeshStandardMaterial;

    if (config.groundMaterial === 'grid') {
      mat = new THREE.MeshStandardMaterial({
        map: createGridTexture(config.groundColor),
        roughness: 0.8,
        metalness: 0.1,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.groundColor),
        roughness: 0.8,
        metalness: 0.1,
      });
    }

    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, 0);
    plane.receiveShadow = true;

    this.groundGroup = new THREE.Group();
    this.groundGroup.add(plane);
    this.scene.add(this.groundGroup);

    // Apply background
    if (config.backgroundMode === 'transparent') {
      this.scene.background = null;
    } else if (config.backgroundMode === 'solid') {
      this.scene.background = new THREE.Color(config.backgroundColor);
    } else {
      // gradient — canvas texture from dark top to color at bottom
      this.scene.background = createGradientTexture(config.backgroundColor);
    }

    // Apply fog
    if (config.fogEnabled) {
      const fogColor = new THREE.Color(config.backgroundColor);
      this.scene.fog = new THREE.FogExp2(fogColor, 0.15);
    } else {
      this.scene.fog = null;
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraController.setMode(mode);
  }

  getCameraMode(): CameraMode {
    return this.cameraController.getMode();
  }

  onFrame(callback: (delta: number) => void): () => void {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter((cb) => cb !== callback);
    };
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start(): void {
    if (this.animationId !== null) return;

    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      const delta = this.clock.getDelta();

      // Update camera controller (smooth transitions)
      this.cameraController.update(delta);

      // Update VRM
      if (this.vrm) {
        this.vrm.update(delta);
      }

      // Run frame callbacks
      for (const cb of this.onFrameCallbacks) {
        cb(delta);
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
    }
  }
}

function createGridTexture(color: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Fill base color
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
  ctx.fillRect(0, 0, size, size);

  // Draw subtle grid lines
  const cells = 10;
  const step = size / cells;
  ctx.strokeStyle = 'rgba(120, 120, 220, 0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= cells; i++) {
    const pos = i * step;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

function createGradientTexture(bottomColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const c = new THREE.Color(bottomColor);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0a0a1a');
  gradient.addColorStop(1, `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
