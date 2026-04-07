#!/usr/bin/env node
/**
 * Generates a minimal valid VRM 0.x GLB file at packages/app/resources/default-avatar.vrm.
 * Run with: node scripts/generate-default-vrm.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const gltfJson = {
  asset: { version: '2.0', generator: 'Aris Default Avatar' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'Root', children: [1] },
    { name: 'Hips', translation: [0, 1, 0] },
  ],
  extensionsUsed: ['VRM'],
  extensions: {
    VRM: {
      specVersion: '0.0',
      meta: {
        title: 'Default Avatar',
        version: '1.0',
        author: 'Aris',
        contactInformation: '',
        reference: '',
        texture: -1,
        allowedUserName: 'Everyone',
        violentUssageName: 'Disallow',
        sexualUssageName: 'Disallow',
        commercialUssageName: 'Disallow',
        otherPermissionUrl: '',
        licenseName: 'Unlicense',
        otherLicenseUrl: '',
      },
      humanoid: {
        humanBones: [{ bone: 'hips', node: 1, useDefaultValues: true }],
      },
    },
  },
};

// Encode JSON and pad to 4-byte alignment with spaces (0x20)
const jsonBytes = Buffer.from(JSON.stringify(gltfJson), 'utf8');
const padding = (4 - (jsonBytes.length % 4)) % 4;
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(padding, 0x20)]);

// GLB header (12 bytes): magic, version, total length
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);          // version 2
header.writeUInt32LE(12 + 8 + paddedJson.length, 8); // total file length

// JSON chunk header (8 bytes): chunk data length, chunk type
const chunkHeader = Buffer.alloc(8);
chunkHeader.writeUInt32LE(paddedJson.length, 0);
chunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

const glb = Buffer.concat([header, chunkHeader, paddedJson]);

const outDir = join(__dirname, '..', 'packages', 'app', 'resources');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'default-avatar.vrm');
writeFileSync(outPath, glb);

console.log(`Generated ${outPath} (${glb.length} bytes)`);
