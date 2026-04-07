import * as THREE from 'three';

/**
 * Generic idle animator for non-humanoid VRM meshes (no bone rig required).
 *
 * Applies three effects to any Object3D:
 *  - Gentle floating bob (sine-based Y translation)
 *  - Slow continuous Y-axis rotation
 *  - Subtle scale pulse (breathing effect)
 *
 * Scale transform origin uses the model bounding-box center so the mesh stays
 * visually anchored as it breathes rather than growing from its root origin.
 */
export class NonHumanoidAnimator {
  private mesh: THREE.Object3D | null = null;
  private time = 0;
  /** Original Y position captured when setMesh was called. */
  private baseY = 0;
  /** Vertical distance from the mesh origin to its bounding-box center. */
  private bboxCenterOffsetY = 0;

  /**
   * Attach the animator to a mesh.  Must be called before the first update().
   * Can be called again to re-attach to a different mesh (e.g. after a reload).
   */
  setMesh(mesh: THREE.Object3D): void {
    this.mesh = mesh;
    this.time = 0;
    this.baseY = mesh.position.y;

    // Derive bbox center in world space then convert to the offset from root.
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    this.bboxCenterOffsetY = center.y - worldPos.y;
  }

  /** Detach from the current mesh without reverting transforms. */
  dispose(): void {
    this.mesh = null;
  }

  /**
   * Advance the animation by `delta` seconds.
   * Call this once per render frame (before VRM.update()).
   */
  update(delta: number): void {
    if (!this.mesh) return;
    this.time += delta;

    // 1. Slow continuous Y-axis rotation (full revolution ≈ 18 s)
    this.mesh.rotation.y += delta * 0.35;

    // 2. Scale pulse — subtle breathing effect
    //    Anchored to bbox center: when scale changes by (s-1), the bbox
    //    center shifts by bboxCenterOffsetY*(s-1), so we subtract it from Y.
    const scalePulse = 1 + Math.sin(this.time * 1.8) * 0.015;
    this.mesh.scale.setScalar(scalePulse);

    // 3. Gentle floating bob (combines with scale compensation on Y)
    const bobOffset = Math.sin(this.time * 1.2) * 0.04;
    this.mesh.position.y =
      this.baseY + bobOffset - this.bboxCenterOffsetY * (scalePulse - 1);
  }
}
