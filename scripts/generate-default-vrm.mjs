#!/usr/bin/env node
/**
 * Generates a REAL humanoid VRM 0.x GLB at packages/app/resources/default-avatar.vrm.
 *
 * Unlike the old 656-byte stub (0 meshes, only a Hips node), this produces a
 * blocky-but-complete mannequin avatar that three-vrm can fully load:
 *   - full humanoid bone hierarchy (hips → spine → chest → neck → head, arms, legs)
 *   - box mesh geometry parented to each bone so it animates with the skeleton
 *   - a "Blink" blendshape (eye morph target) so an expressionManager is created
 *
 * License: CC0 (public domain). Geometry is generated procedurally here, so the
 * asset has no third-party provenance. See resources/DEFAULT_AVATAR_LICENSE.md.
 *
 * Run with: node scripts/generate-default-vrm.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Binary buffer assembler
// ---------------------------------------------------------------------------
const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function align4() {
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    byteLength += pad;
  }
}

function addAccessor(typed, componentType, type, opts = {}) {
  align4();
  const src = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const buf = Buffer.from(src); // copy so later edits to `typed` don't matter
  const bvIndex = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.byteLength });
  chunks.push(buf);
  byteLength += buf.byteLength;

  const acc = {
    bufferView: bvIndex,
    componentType,
    count: typed.length / COMPONENTS[type],
    type,
  };
  if (opts.min) acc.min = opts.min;
  if (opts.max) acc.max = opts.max;
  accessors.push(acc);
  return accessors.length - 1;
}

function vec3MinMax(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Geometry — a 24-vertex (flat-shaded) box centered at (cx,cy,cz)
// ---------------------------------------------------------------------------
function makeBox(w, h, d, cx = 0, cy = 0, cz = 0) {
  const x = w / 2, y = h / 2, z = d / 2;
  // 8 corners
  const c = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], // back face z-
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],     // front face z+
  ];
  // 6 faces, each as 4 corner indices (CCW when viewed from outside)
  const faces = [
    [4, 5, 6, 7], // +z front
    [1, 0, 3, 2], // -z back
    [5, 1, 2, 6], // +x right
    [0, 4, 7, 3], // -x left
    [3, 7, 6, 2], // +y top
    [0, 1, 5, 4], // -y bottom
  ];
  const positions = [];
  const indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const ci of f) {
      positions.push(c[ci][0] + cx, c[ci][1] + cy, c[ci][2] + cz);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

// Build a glTF mesh from one box; returns mesh index.
const meshes = [];
function addBoxMesh(name, box, material, morph) {
  const mm = vec3MinMax(box.positions);
  const posAcc = addAccessor(box.positions, 5126, 'VEC3', mm);
  const idxAcc = addAccessor(box.indices, 5123, 'SCALAR');
  const primitive = {
    attributes: { POSITION: posAcc },
    indices: idxAcc,
    material,
  };
  const mesh = { name, primitives: [primitive] };
  if (morph) {
    const dmm = vec3MinMax(morph);
    const morphAcc = addAccessor(morph, 5126, 'VEC3', dmm);
    primitive.targets = [{ POSITION: morphAcc }];
    mesh.weights = [0];
  }
  meshes.push(mesh);
  return meshes.length - 1;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const M_BODY = 0, M_SKIN = 1, M_EYES = 2;
const materials = [
  { name: 'body', pbrMetallicRoughness: { baseColorFactor: [0.30, 0.52, 0.68, 1], metallicFactor: 0.0, roughnessFactor: 0.85 } },
  { name: 'skin', pbrMetallicRoughness: { baseColorFactor: [0.96, 0.80, 0.70, 1], metallicFactor: 0.0, roughnessFactor: 0.7 } },
  { name: 'eyes', pbrMetallicRoughness: { baseColorFactor: [0.12, 0.12, 0.18, 1], metallicFactor: 0.0, roughnessFactor: 0.4 } },
];

// ---------------------------------------------------------------------------
// Eyes mesh with a blink morph (collapses eyes vertically toward their center)
// ---------------------------------------------------------------------------
function makeEyes() {
  const eyeW = 0.035, eyeH = 0.05, eyeD = 0.02;
  const cz = 0.085, cy = 0.11; // front of head, eye height
  const left = makeBox(eyeW, eyeH, eyeD, 0.045, cy, cz);
  const right = makeBox(eyeW, eyeH, eyeD, -0.045, cy, cz);
  const positions = new Float32Array(left.positions.length + right.positions.length);
  positions.set(left.positions, 0);
  positions.set(right.positions, left.positions.length);
  const indices = new Uint16Array(left.indices.length + right.indices.length);
  indices.set(left.indices, 0);
  const offset = left.positions.length / 3;
  for (let i = 0; i < right.indices.length; i++) indices[left.indices.length + i] = right.indices[i] + offset;
  // Blink morph: move every eye vertex toward eye-center Y so the eye closes.
  const morph = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    morph[i + 0] = 0;
    morph[i + 1] = cy - positions[i + 1];
    morph[i + 2] = 0;
  }
  return { positions, indices, morph };
}

// ---------------------------------------------------------------------------
// Skeleton + body geometry. Each bone node carries the geometry in its local
// frame, so rotating the bone (idle animation) moves the attached mesh.
// ---------------------------------------------------------------------------
const nodes = [];
function addNode(name, translation) {
  nodes.push({ name, translation });
  return nodes.length - 1;
}
function setMesh(idx, meshIndex) { nodes[idx].mesh = meshIndex; }
function addChild(parent, child) {
  (nodes[parent].children ||= []).push(child);
}

// bone name -> node index, for the humanoid map
const bone = {};

// Core spine chain
bone.hips = addNode('hips', [0, 0.90, 0]);
bone.spine = addNode('spine', [0, 0.12, 0]);
bone.chest = addNode('chest', [0, 0.13, 0]);
bone.neck = addNode('neck', [0, 0.18, 0]);
bone.head = addNode('head', [0, 0.08, 0]);
addChild(bone.hips, bone.spine);
addChild(bone.spine, bone.chest);
addChild(bone.chest, bone.neck);
addChild(bone.neck, bone.head);

// Arms
bone.leftShoulder = addNode('leftShoulder', [0.07, 0.15, 0]);
bone.leftUpperArm = addNode('leftUpperArm', [0.06, 0, 0]);
bone.leftLowerArm = addNode('leftLowerArm', [0.22, 0, 0]);
bone.leftHand = addNode('leftHand', [0.20, 0, 0]);
addChild(bone.chest, bone.leftShoulder);
addChild(bone.leftShoulder, bone.leftUpperArm);
addChild(bone.leftUpperArm, bone.leftLowerArm);
addChild(bone.leftLowerArm, bone.leftHand);

bone.rightShoulder = addNode('rightShoulder', [-0.07, 0.15, 0]);
bone.rightUpperArm = addNode('rightUpperArm', [-0.06, 0, 0]);
bone.rightLowerArm = addNode('rightLowerArm', [-0.22, 0, 0]);
bone.rightHand = addNode('rightHand', [-0.20, 0, 0]);
addChild(bone.chest, bone.rightShoulder);
addChild(bone.rightShoulder, bone.rightUpperArm);
addChild(bone.rightUpperArm, bone.rightLowerArm);
addChild(bone.rightLowerArm, bone.rightHand);

// Legs
bone.leftUpperLeg = addNode('leftUpperLeg', [0.08, -0.06, 0]);
bone.leftLowerLeg = addNode('leftLowerLeg', [0, -0.38, 0]);
bone.leftFoot = addNode('leftFoot', [0, -0.40, 0]);
addChild(bone.hips, bone.leftUpperLeg);
addChild(bone.leftUpperLeg, bone.leftLowerLeg);
addChild(bone.leftLowerLeg, bone.leftFoot);

bone.rightUpperLeg = addNode('rightUpperLeg', [-0.08, -0.06, 0]);
bone.rightLowerLeg = addNode('rightLowerLeg', [0, -0.38, 0]);
bone.rightFoot = addNode('rightFoot', [0, -0.40, 0]);
addChild(bone.hips, bone.rightUpperLeg);
addChild(bone.rightUpperLeg, bone.rightLowerLeg);
addChild(bone.rightLowerLeg, bone.rightFoot);

// Eyes node (child of head, holds the blink morph mesh)
const eyesNode = addNode('eyes', [0, 0, 0]);
addChild(bone.head, eyesNode);

// Attach geometry (local frames point toward each bone's child)
setMesh(bone.hips, addBoxMesh('pelvis', makeBox(0.22, 0.14, 0.15, 0, 0.02, 0), M_BODY));
setMesh(bone.chest, addBoxMesh('torso', makeBox(0.28, 0.32, 0.17, 0, 0.07, 0), M_BODY));
setMesh(bone.head, addBoxMesh('head', makeBox(0.18, 0.20, 0.18, 0, 0.10, 0), M_SKIN));

setMesh(bone.leftUpperArm, addBoxMesh('leftUpperArm', makeBox(0.24, 0.075, 0.075, 0.11, 0, 0), M_BODY));
setMesh(bone.leftLowerArm, addBoxMesh('leftLowerArm', makeBox(0.22, 0.065, 0.065, 0.10, 0, 0), M_BODY));
setMesh(bone.leftHand, addBoxMesh('leftHand', makeBox(0.08, 0.045, 0.09, 0.04, 0, 0), M_SKIN));
setMesh(bone.rightUpperArm, addBoxMesh('rightUpperArm', makeBox(0.24, 0.075, 0.075, -0.11, 0, 0), M_BODY));
setMesh(bone.rightLowerArm, addBoxMesh('rightLowerArm', makeBox(0.22, 0.065, 0.065, -0.10, 0, 0), M_BODY));
setMesh(bone.rightHand, addBoxMesh('rightHand', makeBox(0.08, 0.045, 0.09, -0.04, 0, 0), M_SKIN));

setMesh(bone.leftUpperLeg, addBoxMesh('leftUpperLeg', makeBox(0.10, 0.40, 0.11, 0, -0.20, 0), M_BODY));
setMesh(bone.leftLowerLeg, addBoxMesh('leftLowerLeg', makeBox(0.085, 0.42, 0.095, 0, -0.21, 0), M_BODY));
setMesh(bone.leftFoot, addBoxMesh('leftFoot', makeBox(0.095, 0.06, 0.20, 0, -0.03, 0.05), M_BODY));
setMesh(bone.rightUpperLeg, addBoxMesh('rightUpperLeg', makeBox(0.10, 0.40, 0.11, 0, -0.20, 0), M_BODY));
setMesh(bone.rightLowerLeg, addBoxMesh('rightLowerLeg', makeBox(0.085, 0.42, 0.095, 0, -0.21, 0), M_BODY));
setMesh(bone.rightFoot, addBoxMesh('rightFoot', makeBox(0.095, 0.06, 0.20, 0, -0.03, 0.05), M_BODY));

const eyes = makeEyes();
const eyesMeshIndex = addBoxMesh('eyes', { positions: eyes.positions, indices: eyes.indices }, M_EYES, eyes.morph);
setMesh(eyesNode, eyesMeshIndex);

// ---------------------------------------------------------------------------
// VRM 0.x humanoid + blendshape metadata
// ---------------------------------------------------------------------------
const humanBones = Object.entries(bone).map(([name, node]) => ({
  bone: name,
  node,
  useDefaultValues: true,
}));

const lookCurve = { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 90, yRange: 10 };
const presetGroups = [
  'neutral', 'a', 'i', 'u', 'e', 'o',
  'blink', 'joy', 'angry', 'sorrow', 'fun',
  'lookup', 'lookdown', 'lookleft', 'lookright', 'blink_l', 'blink_r',
].map((preset) => ({
  name: preset.charAt(0).toUpperCase() + preset.slice(1),
  presetName: preset,
  binds: preset === 'blink' ? [{ mesh: eyesMeshIndex, index: 0, weight: 100 }] : [],
  materialValues: [],
  isBinary: false,
}));

const vrm = {
  exporterVersion: 'ArisDefaultAvatar-1.0',
  specVersion: '0.0',
  meta: {
    title: 'Aris Companion (Default)',
    version: '1.0',
    author: 'Aris Project',
    contactInformation: '',
    reference: 'Procedurally generated mannequin (scripts/generate-default-vrm.mjs)',
    texture: -1,
    allowedUserName: 'Everyone',
    violentUssageName: 'Disallow',
    sexualUssageName: 'Disallow',
    commercialUssageName: 'Allow',
    otherPermissionUrl: '',
    licenseName: 'CC0',
    otherLicenseUrl: '',
  },
  humanoid: {
    humanBones,
    armStretch: 0.05,
    legStretch: 0.05,
    upperArmTwist: 0.5,
    lowerArmTwist: 0.5,
    upperLegTwist: 0.5,
    lowerLegTwist: 0.5,
    feetSpacing: 0,
    hasTranslationDoF: false,
  },
  firstPerson: {
    firstPersonBone: bone.head,
    firstPersonBoneOffset: { x: 0, y: 0.06, z: 0 },
    meshAnnotations: [],
    lookAtTypeName: 'Bone',
    lookAtHorizontalInner: lookCurve,
    lookAtHorizontalOuter: lookCurve,
    lookAtVerticalDown: lookCurve,
    lookAtVerticalUp: lookCurve,
  },
  blendShapeMaster: { blendShapeGroups: presetGroups },
  secondaryAnimation: { boneGroups: [], colliderGroups: [] },
};

// ---------------------------------------------------------------------------
// Assemble the binary buffer + glTF JSON, then wrap as GLB
// ---------------------------------------------------------------------------
const binBuffer = Buffer.concat(chunks);

const gltf = {
  asset: { version: '2.0', generator: 'Aris Default Avatar (humanoid)' },
  scene: 0,
  scenes: [{ nodes: [bone.hips] }],
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binBuffer.byteLength }],
  extensionsUsed: ['VRM'],
  extensions: { VRM: vrm },
};

const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

const binPad = (4 - (binBuffer.length % 4)) % 4;
const paddedBin = Buffer.concat([binBuffer, Buffer.alloc(binPad, 0x00)]);

const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);          // version 2
header.writeUInt32LE(totalLength, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(paddedBin.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

const glb = Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkHeader, paddedBin]);

const outDir = join(__dirname, '..', 'packages', 'app', 'resources');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'default-avatar.vrm');
writeFileSync(outPath, glb);

console.log(
  `Generated ${outPath} (${glb.length} bytes) — ${meshes.length} meshes, ${nodes.length} nodes, ${humanBones.length} humanoid bones`,
);
