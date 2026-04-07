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
