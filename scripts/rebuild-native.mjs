/**
 * Rebuild native Node modules for Electron's Node.js ABI.
 *
 * Downloads the prebuilt better-sqlite3 binary for the project's Electron
 * version directly from GitHub releases. No C++ compiler required.
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { get } from 'https';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd());

// Read versions from project dependencies
const electronVersion = require('electron/package.json').version;
const bsqlVersion = require(
  join(root, 'packages', 'app', 'package.json'),
).dependencies['better-sqlite3'].replace(/[\^~]/, '');

// Electron v33 → NODE_MODULE_VERSION 130
// We derive the ABI from the Electron version range
const electronMajor = parseInt(electronVersion.split('.')[0], 10);
const abiMap = { 31: 127, 32: 128, 33: 130, 34: 132 };
const electronAbi = abiMap[electronMajor];
if (!electronAbi) {
  console.error(`[rebuild] Unknown Electron major version ${electronMajor}. Known: ${Object.keys(abiMap).join(', ')}`);
  process.exit(1);
}

const platform = process.platform;   // win32, darwin, linux
const arch = process.arch;           // x64, arm64
const prebuiltUrl =
  `https://github.com/WiseLibs/better-sqlite3/releases/download/` +
  `v${bsqlVersion}/better-sqlite3-v${bsqlVersion}-electron-v${electronAbi}-${platform}-${arch}.tar.gz`;

console.log(`[rebuild] Electron v${electronVersion} (ABI ${electronAbi}), platform ${platform}-${arch}`);
console.log(`[rebuild] Prebuilt URL: ${prebuiltUrl}`);

// Find better-sqlite3 in pnpm store or node_modules
function findBetterSqlite3() {
  const pnpmDir = join(root, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    const entries = readdirSync(pnpmDir).filter((e) => e.startsWith('better-sqlite3@'));
    for (const entry of entries) {
      const candidate = join(pnpmDir, entry, 'node_modules', 'better-sqlite3');
      if (existsSync(candidate)) return candidate;
    }
  }
  const direct = join(root, 'node_modules', 'better-sqlite3');
  if (existsSync(direct)) return direct;
  const appDirect = join(root, 'packages', 'app', 'node_modules', 'better-sqlite3');
  if (existsSync(appDirect)) return appDirect;
  return null;
}

const moduleDir = findBetterSqlite3();
if (!moduleDir) {
  console.error('[rebuild] Cannot find better-sqlite3. Run pnpm install first.');
  process.exit(1);
}

console.log(`[rebuild] Module dir: ${moduleDir}`);

// Download and extract the prebuilt binary
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

  // Download into memory
  const data = await new Promise((resolve, reject) => {
    download(prebuiltUrl).then((stream) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    }, reject);
  });

  console.log(`[rebuild] Downloaded ${(data.length / 1024).toFixed(0)} KB`);

  // Remove existing .node file first — pnpm hard-links it from the store,
  // and tar may not overwrite hard-linked files on Windows.
  const releaseDir = join(moduleDir, 'build', 'Release');
  mkdirSync(releaseDir, { recursive: true });
  const nodeFile = join(releaseDir, 'better_sqlite3.node');
  if (existsSync(nodeFile)) {
    unlinkSync(nodeFile);
    console.log('[rebuild] Removed existing .node file (pnpm hard link)');
  }

  // Extract by piping through stdin to avoid Windows path issues with tar
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
    console.log(`[rebuild] Installed prebuilt binary (${(size / 1024).toFixed(0)} KB) at: ${nodeFile}`);
    console.log('[rebuild] Done — native modules ready for Electron.');
  } else {
    throw new Error('Extracted archive but .node file not found');
  }
} catch (e) {
  console.error(`[rebuild] Prebuilt download failed: ${e.message}`);
  console.error('');
  console.error('To fix this, install Visual Studio C++ build tools:');
  console.error('  1. Open Visual Studio Installer');
  console.error('  2. Modify VS2022 → add "Desktop development with C++"');
  console.error('  3. Then run: pnpm run rebuild');
  process.exit(1);
}
