/**
 * Cross-platform dev script.
 * Builds non-renderer packages, starts the Vite dev server,
 * waits for it to be ready, then launches Electron.
 */
import { spawn, execSync } from 'child_process';
import { request } from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 2. Build all packages except renderer (sync — must finish first)
console.log('[dev] Building packages...');
execSync('pnpm -r --filter "!@aris/renderer" build', { stdio: 'inherit' });

// 3. Start Vite dev server in background
console.log('[dev] Starting Vite dev server...');
const vite = spawn('pnpm', ['--filter', '@aris/renderer', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

// 4. Poll until Vite is ready, then launch Electron
const VITE_URL = 'http://localhost:5173';
const MAX_WAIT = 30_000;
const POLL_INTERVAL = 500;

function checkVite() {
  return new Promise((resolve) => {
    const req = request(VITE_URL, { method: 'HEAD', timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function waitForVite() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT) {
    if (await checkVite()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  return false;
}

const ready = await waitForVite();
if (!ready) {
  console.error('[dev] Vite did not start within 30 seconds. Launching Electron anyway...');
}

console.log('[dev] Launching Electron...');
const electronPath = require('electron');
const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});

// Clean up: when Electron exits, kill Vite and exit
electron.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});

// Also handle Ctrl+C
process.on('SIGINT', () => {
  vite.kill();
  electron.kill();
  process.exit(0);
});
