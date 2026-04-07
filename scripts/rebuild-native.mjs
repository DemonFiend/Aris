/**
 * Rebuild native Node modules for Electron's Node.js ABI.
 *
 * Downloads the prebuilt better-sqlite3 binary for the project's Electron
 * version directly from GitHub releases. No C++ compiler required.
 *
 * The pnpm hard-linked .node file is deleted first so the new binary
 * replaces it cleanly.
 */
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { get } from 'https';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd());

// Read versions from project dependencies
const electronVersion = require('electron/package.json').version;
const bsqlPkg = require(join(root, 'packages', 'app', 'package.json'));
const bsqlVersion = bsqlPkg.dependencies['better-sqlite3'].replace(/[\^~]/, '');

// Electron major → NODE_MODULE_VERSION mapping
const electronMajor = parseInt(electronVersion.split('.')[0], 10);
const abiMap = { 31: 127, 32: 128, 33: 130, 34: 132, 35: 133, 36: 135, 37: 136, 38: 139, 39: 140 };
const electronAbi = abiMap[electronMajor];
if (!electronAbi) {
  console.error(`[rebuild] Unknown Electron major ${electronMajor}. Known: ${Object.keys(abiMap).join(', ')}`);
  process.exit(1);
}

const platform = process.platform;
const arch = process.arch;
const prebuiltUrl =
  `https://github.com/WiseLibs/better-sqlite3/releases/download/` +
  `v${bsqlVersion}/better-sqlite3-v${bsqlVersion}-electron-v${electronAbi}-${platform}-${arch}.tar.gz`;

console.log(`[rebuild] Electron v${electronVersion} (ABI ${electronAbi}), ${platform}-${arch}`);
console.log(`[rebuild] Prebuilt: ${prebuiltUrl}`);

// Find better-sqlite3 in pnpm store or node_modules
function findBetterSqlite3() {
  const pnpmDir = join(root, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const entry of readdirSync(pnpmDir)) {
      if (!entry.startsWith('better-sqlite3@')) continue;
      const p = join(pnpmDir, entry, 'node_modules', 'better-sqlite3');
      if (existsSync(p)) return p;
    }
  }
  for (const p of [
    join(root, 'packages', 'app', 'node_modules', 'better-sqlite3'),
    join(root, 'node_modules', 'better-sqlite3'),
  ]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const moduleDir = findBetterSqlite3();
if (!moduleDir) {
  console.error('[rebuild] Cannot find better-sqlite3. Run pnpm install first.');
  process.exit(1);
}
console.log(`[rebuild] Module: ${moduleDir}`);

// Follow redirects and download
function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

try {
  console.log('[rebuild] Downloading prebuilt binary...');
  const data = await new Promise((resolve, reject) => {
    download(prebuiltUrl).then((stream) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    }, reject);
  });
  console.log(`[rebuild] Downloaded ${(data.length / 1024).toFixed(0)} KB`);

  // Delete existing .node file to break pnpm hard link
  const releaseDir = join(moduleDir, 'build', 'Release');
  mkdirSync(releaseDir, { recursive: true });
  const nodeFile = join(releaseDir, 'better_sqlite3.node');
  if (existsSync(nodeFile)) {
    unlinkSync(nodeFile);
    console.log('[rebuild] Removed old .node file (pnpm hard link)');
  }

  // Extract — pipe through stdin with forward-slash path for cross-platform tar
  const destPath = moduleDir.replace(/\\/g, '/');
  const result = spawnSync('tar', ['-xzf', '-', '-C', destPath], {
    input: data,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new Error(`tar exited with code ${result.status}`);
  }

  if (existsSync(nodeFile)) {
    const size = statSync(nodeFile).size;
    console.log(`[rebuild] Installed prebuilt (${(size / 1024).toFixed(0)} KB): ${nodeFile}`);
    console.log('[rebuild] Done — native modules ready for Electron.');
  } else {
    throw new Error('tar extracted but .node file not found');
  }
} catch (e) {
  console.error(`[rebuild] Failed: ${e.message}`);
  console.error('');
  console.error('If the prebuilt download failed, install VC++ build tools and retry:');
  console.error('  1. Open Visual Studio Installer');
  console.error('  2. Modify VS2022 > add "Desktop development with C++"');
  console.error('  3. Run: pnpm run rebuild');
  process.exit(1);
}
