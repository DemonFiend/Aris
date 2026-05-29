import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { ClickZone } from '@aris/shared';

const _v3 = new THREE.Vector3();

/**
 * Resolve which body region a click ray "hit" by finding the closest humanoid
 * bone to the ray. Within the head bone's radius, the click is a `head`
 * (headpat); otherwise it's a `body` (poke).
 *
 * The radius scales with the avatar's bbox so chibi and realistic models
 * both behave reasonably without per-model tuning.
 */
export function resolveClickZone(
  vrm: VRM,
  ray: THREE.Ray,
  /** Avatar bbox diagonal in world units — sets the radius scale. */
  avatarScale: number,
): ClickZone {
  const head = vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Head);
  if (!head) return 'body';

  head.getWorldPosition(_v3);
  const distToRay = ray.distanceToPoint(_v3);

  // ~12% of bbox diagonal is roughly the head radius across humanoid models.
  // Slightly generous so clicks on the visible head silhouette resolve as a
  // headpat even when the ray grazes the side.
  const headRadius = avatarScale * 0.12;

  if (distToRay < headRadius) return 'head';
  return 'body';
}
