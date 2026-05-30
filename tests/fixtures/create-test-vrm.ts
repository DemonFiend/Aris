/**
 * Generate a minimal valid VRM (GLB) file for e2e testing.
 *
 * The file contains a single-triangle mesh with VRM0 extension metadata.
 * It is enough for @pixiv/three-vrm's VRMLoaderPlugin to produce a VRM object.
 */
export function createMinimalVRM(): Buffer {
  // 3 vertices: simple triangle
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);
  const binData = Buffer.from(positions.buffer);

  const json = {
    asset: { version: '2.0', generator: 'aris-test-fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Root', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binData.byteLength }],
    buffers: [{ byteLength: binData.byteLength }],
    extensionsUsed: ['VRM'],
    extensions: {
      VRM: {
        exporterVersion: 'aris-test-1.0',
        specVersion: '0.0',
        meta: {
          title: 'Test Avatar',
          version: '1',
          author: 'Aris Test',
          allowedUserName: 'Everyone',
          violentUssageName: 'Disallow',
          sexualUssageName: 'Disallow',
          commercialUssageName: 'Disallow',
          licenseName: 'CC0',
        },
        humanoid: {
          humanBones: [],
          armStretch: 0.05,
          legStretch: 0.05,
          upperArmTwist: 0.5,
          lowerArmTwist: 0.5,
          upperLegTwist: 0.5,
          lowerLegTwist: 0.5,
          feetSpacing: 0,
          hasTranslationDoF: false,
        },
      },
    },
  };

  const jsonStr = JSON.stringify(json);
  // JSON chunk must be padded to 4-byte boundary with spaces
  const jsonPadded = jsonStr + ' '.repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBuf = Buffer.from(jsonPadded, 'utf8');

  // BIN chunk must be padded to 4-byte boundary with zeros
  const binPadLen = (4 - (binData.byteLength % 4)) % 4;
  const binBuf = binPadLen > 0 ? Buffer.concat([binData, Buffer.alloc(binPadLen)]) : binData;

  // GLB header: magic(4) + version(4) + totalLength(4)
  const totalLength = 12 + 8 + jsonBuf.byteLength + 8 + binBuf.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  // JSON chunk header
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  // BIN chunk header
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]);
}

/**
 * Generate a real *humanoid* VRM (VRM0 GLB) for e2e testing.
 *
 * Unlike {@link createMinimalVRM} (a degenerate stub that loads as a
 * non-humanoid fallback), this fixture declares the full set of VRM0
 * required human bones. @pixiv/three-vrm's VRMHumanoidLoaderPlugin throws
 * unless every required bone is present, so a partial skeleton silently
 * falls back. With the complete skeleton here the humanoid is constructed,
 * `AvatarScene.detectHumanoid` returns true, and the full bone-animation
 * stack (idle / gaze / blink) runs — which is what the animation specs
 * assert against via `window.__arisE2E.getBoneEuler(...)`.
 *
 * The skeleton is a JSON-only GLB (no meshes/buffers): bones alone are
 * enough to build the normalized humanoid rig the controllers drive. A
 * single VRM0 blendShapeGroup gives the model one expression so the
 * expression pipeline is exercised too.
 */
export function createHumanoidVRM(): Buffer {
  // Bone hierarchy: [name, humanBoneName | null, translation, children].
  // Node index === position in this array. Node 0 is the non-bone root.
  type BoneDef = [string, string | null, [number, number, number], number[]];
  const bones: BoneDef[] = [
    ['Root', null, [0, 0, 0], [1]],
    ['Hips', 'hips', [0, 1, 0], [2, 8, 11]],
    ['Spine', 'spine', [0, 0.1, 0], [3]],
    ['Chest', 'chest', [0, 0.1, 0], [4, 14, 18]],
    ['Neck', 'neck', [0, 0.15, 0], [5]],
    ['Head', 'head', [0, 0.1, 0], [6, 7]],
    ['LeftEye', 'leftEye', [0.03, 0.06, 0.08], []],
    ['RightEye', 'rightEye', [-0.03, 0.06, 0.08], []],
    ['LeftUpperLeg', 'leftUpperLeg', [0.09, -0.05, 0], [9]],
    ['LeftLowerLeg', 'leftLowerLeg', [0, -0.4, 0], [10]],
    ['LeftFoot', 'leftFoot', [0, -0.4, 0.07], []],
    ['RightUpperLeg', 'rightUpperLeg', [-0.09, -0.05, 0], [12]],
    ['RightLowerLeg', 'rightLowerLeg', [0, -0.4, 0], [13]],
    ['RightFoot', 'rightFoot', [0, -0.4, 0.07], []],
    ['LeftShoulder', 'leftShoulder', [0.05, 0.05, 0], [15]],
    ['LeftUpperArm', 'leftUpperArm', [0.1, 0, 0], [16]],
    ['LeftLowerArm', 'leftLowerArm', [0.25, 0, 0], [17]],
    ['LeftHand', 'leftHand', [0.25, 0, 0], []],
    ['RightShoulder', 'rightShoulder', [-0.05, 0.05, 0], [19]],
    ['RightUpperArm', 'rightUpperArm', [-0.1, 0, 0], [20]],
    ['RightLowerArm', 'rightLowerArm', [-0.25, 0, 0], [21]],
    ['RightHand', 'rightHand', [-0.25, 0, 0], []],
  ];

  const nodes = bones.map(([name, , translation, children]) => ({
    name,
    translation,
    ...(children.length > 0 ? { children } : {}),
  }));

  const humanBones = bones
    .map(([, bone], node) => (bone ? { bone, node, useDefaultValues: true } : null))
    .filter((b): b is { bone: string; node: number; useDefaultValues: boolean } => b !== null);

  const json = {
    asset: { version: '2.0', generator: 'aris-test-fixture-humanoid' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    extensionsUsed: ['VRM'],
    extensions: {
      VRM: {
        exporterVersion: 'aris-test-1.0',
        specVersion: '0.0',
        meta: {
          title: 'Humanoid Test Avatar',
          version: '1',
          author: 'Aris Test',
          allowedUserName: 'Everyone',
          violentUssageName: 'Disallow',
          sexualUssageName: 'Disallow',
          commercialUssageName: 'Disallow',
          licenseName: 'CC0',
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
        // One expression so the expression pipeline runs. No binds are needed
        // for the manager to register the preset — VRMExpressionLoaderPlugin
        // creates the VRMExpression from presetName alone.
        blendShapeMaster: {
          blendShapeGroups: [
            {
              name: 'Joy',
              presetName: 'joy',
              binds: [],
              materialValues: [],
              isBinary: false,
            },
          ],
        },
      },
    },
  };

  // JSON-only GLB (no BIN chunk): a bone skeleton needs no binary buffers.
  const jsonStr = JSON.stringify(json);
  const jsonPadded = jsonStr + ' '.repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBuf = Buffer.from(jsonPadded, 'utf8');

  const totalLength = 12 + 8 + jsonBuf.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  return Buffer.concat([header, jsonChunkHeader, jsonBuf]);
}
