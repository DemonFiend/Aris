import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';

export class AvatarScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private clock = new THREE.Clock();
  private animationId: number | null = null;
  private vrm: VRM | null = null;
  private onFrameCallbacks: Array<(delta: number) => void> = [];

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

    // Camera — portrait framing for bust/head shot
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.4, 1.5);
    this.camera.lookAt(0, 1.3, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(1, 2, 3);
    this.scene.add(directional);

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
