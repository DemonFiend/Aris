/**
 * Rebuild better-sqlite3 for Electron's Node ABI.
 *
 * The upstream prebuilt binaries for better-sqlite3 + Electron 33 are
 * broken (contain Node.js ABI 127 instead of Electron ABI 130), so we
 * must compile from source using node-gyp + Electron headers.
 *
 * Requires the VC++ Build Tools on Windows.
 */
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, readdirSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd());
const electronVersion = require('electron/package.json').version;

console.log(`[rebuild] Targeting Electron v${electronVersion}`);

// --- Locate better-sqlite3 ---
function findModule() {
  const pnpmDir = join(root, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const entry of readdirSync(pnpmDir)) {
      if (entry.startsWith('better-sqlite3@')) {
        const p = join(pnpmDir, entry, 'node_modules', 'better-sqlite3');
        if (existsSync(p)) return p;
      }
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

const moduleDir = findModule();
if (!moduleDir) {
  console.error('[rebuild] Cannot find better-sqlite3. Run pnpm install first.');
  process.exit(1);
}
console.log(`[rebuild] Found at: ${moduleDir}`);

// --- Remove existing .node to break pnpm hard links ---
const releaseDir = join(moduleDir, 'build', 'Release');
const nodeFile = join(releaseDir, 'better_sqlite3.node');
if (existsSync(nodeFile)) {
  rmSync(nodeFile, { force: true });
  console.log('[rebuild] Removed old .node file');
}
mkdirSync(releaseDir, { recursive: true });

// --- Compile from source ---
try {
  console.log('[rebuild] Compiling from source against Electron headers...');
  execSync(
    [
      'npx node-gyp rebuild',
      '--runtime=electron',
      `--target=${electronVersion}`,
      '--disturl=https://electronjs.org/headers',
    ].join(' '),
    { cwd: moduleDir, stdio: 'inherit' },
  );
  console.log('[rebuild] Success! better-sqlite3 rebuilt for Electron.');
} catch {
  console.error('');
  console.error('================================================================');
  console.error('  REBUILD FAILED — VC++ Build Tools not installed');
  console.error('================================================================');
  console.error('');
  console.error('  better-sqlite3 must be compiled from source because the');
  console.error('  upstream Electron prebuilt binary is broken (wrong ABI).');
  console.error('');
  console.error('  Fix (one-time setup, takes ~5 min):');
  console.error('');
  console.error('  1. Open "Visual Studio Installer" from Start Menu');
  console.error('  2. Click "Modify" on Visual Studio 2022');
  console.error('  3. Check "Desktop development with C++"');
  console.error('  4. Click "Modify" and wait for install');
  console.error('  5. Then run:  pnpm run rebuild');
  console.error('');
  console.error('  Or from an Admin terminal:');
  console.error('');
  console.error('  & "C:\\Program Files (x86)\\Microsoft Visual Studio\\');
  console.error('    Installer\\setup.exe" modify --installPath "C:\\Program');
  console.error('    Files\\Microsoft Visual Studio\\2022\\Community"');
  console.error('    --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64');
  console.error('    --add Microsoft.VisualStudio.Component.Windows11SDK.26100');
  console.error('    --passive --norestart');
  console.error('');
  console.error('================================================================');
  process.exit(1);
}
