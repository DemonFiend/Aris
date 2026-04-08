import { shell, app } from 'electron';
import { platform } from 'os';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { detectService } from './service-detector';
import type {
  ServiceName,
  ServiceInstallInfo,
  ServiceDetectionResult,
  InstallProgress,
  InstallResult,
  InstallManifest,
} from '@aris/shared';

const OS = platform();

// ---------------------------------------------------------------------------
// Install manifest — tested versions and download URLs.
// Source of truth for what versions Aris downloads on demand (Option C).
// JSON data is kept in install-manifest.json for reference; the typed
// constant here avoids needing tsc to copy JSON to dist at build time.
// ---------------------------------------------------------------------------
const MANIFEST: InstallManifest = {
  lmstudio: {
    version: '0.3.6',
    win32: {
      url: 'https://releases.lmstudio.ai/windows/x64/0.3.6/1/LM-Studio-0.3.6.exe',
      filename: 'LM-Studio-0.3.6-Setup.exe',
    },
    darwin: null,
    linux: null,
  },
  ollama: {
    version: '0.6.4',
    win32: {
      url: 'https://github.com/ollama/ollama/releases/download/v0.6.4/OllamaSetup.exe',
      filename: 'OllamaSetup.exe',
    },
    darwin: null,
    linux: null,
  },
  whisper: {
    version: '1.7.5',
    win32: {
      url: 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip',
      filename: 'whisper-bin-x64.zip',
    },
    darwin: null,
    linux: null,
    models: {
      'base.en': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
        filename: 'ggml-base.en.bin',
      },
    },
  },
  kokoro: {
    version: 'latest',
    win32: null,
    darwin: null,
    linux: null,
  },
};

// ---------------------------------------------------------------------------
// Static download URL registry — never accept external input for these URLs.
// All values are official sources validated at dev time.
// ---------------------------------------------------------------------------

const DOWNLOAD_URLS: Record<ServiceName, string> = {
  lmstudio: 'https://lmstudio.ai/download',
  ollama: 'https://ollama.com/download',
  kokoro: 'https://github.com/remsky/Kokoro-FastAPI/releases/latest',
  whisper: 'https://github.com/ggerganov/whisper.cpp/releases/latest',
};

// ---------------------------------------------------------------------------
// Per-service install info builders (manual guidance fallback)
// ---------------------------------------------------------------------------

function lmStudioInfo(): ServiceInstallInfo {
  let installSteps: string[];
  switch (OS) {
    case 'win32':
      installSteps = [
        'Download the LM Studio installer (.exe) from the link above',
        'Run the installer and follow the setup wizard',
        'Launch LM Studio after installation completes',
        'Click "Local Server" in the left sidebar',
        'Press "Start Server" to enable the local API',
        'Download a model from the Discover tab',
      ];
      break;
    case 'darwin':
      installSteps = [
        'Download the LM Studio .dmg from the link above',
        'Open the .dmg and drag LM Studio to your Applications folder',
        'Launch LM Studio',
        'Click "Local Server" in the left sidebar',
        'Press "Start Server" to enable the local API',
        'Download a model from the Discover tab',
      ];
      break;
    default:
      installSteps = [
        'Download the LM Studio AppImage from the link above',
        'Make it executable: chmod +x LM-Studio-*.AppImage',
        'Run the AppImage',
        'Click "Local Server" in the left sidebar',
        'Press "Start Server" to enable the local API',
        'Download a model from the Discover tab',
      ];
  }
  return {
    name: 'lmstudio',
    displayName: 'LM Studio',
    description: 'Run large language models locally with a friendly GUI and built-in model browser.',
    downloadUrl: DOWNLOAD_URLS.lmstudio,
    installSteps,
    modelNote: 'After installing, download at least one model from the Discover tab before using Aris.',
  };
}

function ollamaInfo(): ServiceInstallInfo {
  let installSteps: string[];
  switch (OS) {
    case 'win32':
      installSteps = [
        'Download the Ollama installer from the link above',
        'Run the installer — Ollama will install as a background service',
        'Open a terminal (Command Prompt or PowerShell)',
        'Run: ollama pull llama3.2',
      ];
      break;
    case 'darwin':
      installSteps = [
        'Download Ollama for macOS from the link above',
        'Open the downloaded file and follow the setup prompts',
        'Open Terminal',
        'Run: ollama pull llama3.2',
      ];
      break;
    default:
      installSteps = [
        'Install via the official script: curl -fsSL https://ollama.com/install.sh | sh',
        'The Ollama service starts automatically after install',
        'Pull a model: ollama pull llama3.2',
      ];
  }
  return {
    name: 'ollama',
    displayName: 'Ollama',
    description: 'Open-source local model runner. Simple CLI-based model management.',
    downloadUrl: DOWNLOAD_URLS.ollama,
    installSteps,
    modelNote: 'Run `ollama pull <model-name>` in a terminal to download a model. Try `llama3.2` as a starting point.',
  };
}

function kokoroInfo(): ServiceInstallInfo {
  return {
    name: 'kokoro',
    displayName: 'Kokoro TTS',
    description: 'High-quality local text-to-speech engine using the Kokoro model.',
    downloadUrl: DOWNLOAD_URLS.kokoro,
    installSteps: [
      'Download the latest Kokoro-FastAPI release from the link above',
      'Ensure Python 3.9+ is installed on your system',
      'Extract the archive and open a terminal in that folder',
      'Install dependencies: pip install -r requirements.txt',
      'Start the server: python main.py',
      'The API will be available at http://127.0.0.1:8880',
    ],
    modelNote: null,
  };
}

function whisperInfo(): ServiceInstallInfo {
  let installSteps: string[];
  switch (OS) {
    case 'win32':
      installSteps = [
        'Download the whisper.cpp Windows release from the link above',
        'Extract the archive to a folder of your choice',
        'Download a model by running: download-ggml-model.cmd base.en',
        'Start the server: whisper-server.exe --host 127.0.0.1 --port 8001 -m models/ggml-base.en.bin',
      ];
      break;
    case 'darwin':
      installSteps = [
        'Install via Homebrew: brew install openai-whisper',
        'Or clone whisper.cpp from the link above and build: make -j',
        'Download a model: bash ./models/download-ggml-model.sh base.en',
        'Start the server: ./server --host 127.0.0.1 --port 8001 -m models/ggml-base.en.bin',
      ];
      break;
    default:
      installSteps = [
        'Clone whisper.cpp from the link above',
        'Build: make -j',
        'Download a model: bash ./models/download-ggml-model.sh base.en',
        'Start the server: ./server --host 127.0.0.1 --port 8001 -m models/ggml-base.en.bin',
      ];
  }
  return {
    name: 'whisper',
    displayName: 'Whisper STT',
    description: 'Fast, accurate speech-to-text powered by OpenAI Whisper running locally.',
    downloadUrl: DOWNLOAD_URLS.whisper,
    installSteps,
    modelNote: 'The base.en model is a good starting point — accurate and fast on most hardware.',
  };
}

const INFO_BUILDERS: Record<ServiceName, () => ServiceInstallInfo> = {
  lmstudio: lmStudioInfo,
  ollama: ollamaInfo,
  kokoro: kokoroInfo,
  whisper: whisperInfo,
};

// ---------------------------------------------------------------------------
// Public API — manual guidance
// ---------------------------------------------------------------------------

/** Return platform-specific install info for a single service. */
export function getInstallInfo(name: ServiceName): ServiceInstallInfo {
  return INFO_BUILDERS[name]();
}

/** Return install info for all known services. */
export function getAllInstallInfo(): ServiceInstallInfo[] {
  return (Object.keys(INFO_BUILDERS) as ServiceName[]).map((n) => INFO_BUILDERS[n]());
}

/**
 * Open the official download page for a service in the system browser.
 * Only our pre-validated static URLs are ever opened — no user-provided URLs.
 */
export async function openDownloadPage(name: ServiceName): Promise<void> {
  const url = DOWNLOAD_URLS[name];
  if (!url) throw new Error(`Unknown service: ${name}`);
  await shell.openExternal(url);
}

/**
 * Re-run the service detector for a single service to check post-install status.
 */
export async function verifyInstall(name: ServiceName): Promise<ServiceDetectionResult> {
  return detectService(name);
}

/** Return the version manifest for UI display. */
export function getManifest(): InstallManifest {
  return MANIFEST;
}

// ---------------------------------------------------------------------------
// Option C: Download + auto-install
// ---------------------------------------------------------------------------

type ProgressCallback = (progress: InstallProgress) => void;

function emit(
  cb: ProgressCallback,
  service: ServiceName,
  stage: InstallProgress['stage'],
  percent: number,
  message: string,
): void {
  cb({ service, stage, percent, message });
}

/**
 * Download a URL to destPath, calling onProgress with 0-100 during the transfer.
 * Follows up to 5 redirects automatically.
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void,
  redirectDepth = 0,
): Promise<void> {
  if (redirectDepth > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 30_000 }, (res) => {
      const { statusCode, headers } = res;
      if (
        (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) &&
        headers.location
      ) {
        res.resume();
        downloadFile(headers.location, destPath, onProgress, redirectDepth + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${statusCode} while downloading ${url}`));
        return;
      }
      const total = parseInt(headers['content-length'] ?? '0', 10);
      let downloaded = 0;
      const out = fs.createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (total > 0) onProgress(Math.floor((downloaded / total) * 100));
      });
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

/**
 * Extract a .zip archive to destDir.
 * Windows: delegates to PowerShell Expand-Archive.
 * Other platforms: throws — only Windows is supported for auto-extract.
 */
export function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (OS !== 'win32') {
    return Promise.reject(new Error('Zip extraction is only supported on Windows'));
  }
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    // Escape embedded single-quotes for PowerShell single-quoted strings (O'Brien → O''Brien)
    const safeZipPath = zipPath.replace(/'/g, "''");
    const safeDestDir = destDir.replace(/'/g, "''");
    const ps = spawn(
      'powershell',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Force -LiteralPath '${safeZipPath}' -DestinationPath '${safeDestDir}'`,
      ],
      { stdio: 'inherit' },
    );
    ps.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Expand-Archive exited with code ${code}`));
    });
    ps.on('error', reject);
  });
}

/**
 * Open a downloaded installer file with the OS shell (native installer wizard).
 * Only accepts absolute paths that exist on disk.
 */
export async function launchInstaller(installerPath: string): Promise<void> {
  if (!path.isAbsolute(installerPath) || !fs.existsSync(installerPath)) {
    throw new Error('Invalid installer path');
  }
  await shell.openPath(installerPath);
}

/**
 * Start the whisper.cpp server process detached so it survives Aris restarting.
 */
export function startWhisperService(installDir: string, modelPath: string): void {
  const binaryName = OS === 'win32' ? 'whisper-server.exe' : 'server';
  let binaryPath = path.join(installDir, binaryName);

  if (!fs.existsSync(binaryPath)) {
    // Some zip releases wrap files in a single subdirectory
    for (const entry of fs.readdirSync(installDir)) {
      const candidate = path.join(installDir, entry, binaryName);
      if (fs.existsSync(candidate)) {
        binaryPath = candidate;
        break;
      }
    }
  }
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`whisper-server binary not found under ${installDir}`);
  }
  const child = spawn(
    binaryPath,
    ['--host', '127.0.0.1', '--port', '8001', '-m', modelPath],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
}

/**
 * Full install flow for a service (Option C):
 * - lmstudio / ollama: download installer → launch via OS shell
 * - whisper: download binary zip → extract → download model → start server
 * - kokoro: open download page (auto-install deferred, Python packaging complexity)
 *
 * Progress events are emitted via `onProgress` throughout.
 */
export async function downloadAndInstall(
  name: ServiceName,
  onProgress: ProgressCallback,
): Promise<InstallResult> {
  const entry = MANIFEST[name];
  const platformKey = OS as 'win32' | 'darwin' | 'linux';
  const platformEntry = entry[platformKey];

  // Kokoro (and any service with no platform entry): open download page + show manual guide
  if (!platformEntry) {
    await openDownloadPage(name);
    emit(onProgress, name, 'done', 100, 'Download page opened — follow the manual guide below');
    return { service: name, success: true, error: null };
  }

  const tmpDir = app.getPath('temp');
  const destPath = path.join(tmpDir, platformEntry.filename);

  try {
    // ── Step 1: Download ────────────────────────────────────────────────────
    emit(onProgress, name, 'downloading', 0, `Downloading ${platformEntry.filename}…`);
    await downloadFile(platformEntry.url, destPath, (pct) => {
      emit(onProgress, name, 'downloading', pct, `Downloading… ${pct}%`);
    });
    emit(onProgress, name, 'downloading', 100, 'Download complete');

    // ── Step 2a: LM Studio / Ollama — launch native installer ────────────────
    if (name === 'lmstudio' || name === 'ollama') {
      emit(onProgress, name, 'installing', 0, 'Launching installer…');
      await launchInstaller(destPath);
      emit(
        onProgress, name, 'done', 100,
        'Installer launched. Complete the wizard, then click Re-check.',
      );
      return { service: name, success: true, error: null };
    }

    // ── Step 2b: whisper.cpp — extract + model download + start ──────────────
    if (name === 'whisper') {
      const installDir = path.join(app.getPath('userData'), 'services', 'whisper');

      emit(onProgress, name, 'extracting', 0, 'Extracting whisper binary…');
      await extractZip(destPath, installDir);
      emit(onProgress, name, 'extracting', 100, 'Extraction complete');

      const modelEntry = entry.models?.['base.en'];
      if (!modelEntry) throw new Error('Model manifest entry missing for whisper base.en');

      const modelDir = path.join(installDir, 'models');
      fs.mkdirSync(modelDir, { recursive: true });
      const modelPath = path.join(modelDir, modelEntry.filename);

      emit(onProgress, name, 'downloading', 0, 'Downloading base.en model (this may take a while)…');
      await downloadFile(modelEntry.url, modelPath, (pct) => {
        emit(onProgress, name, 'downloading', pct, `Downloading model… ${pct}%`);
      });
      emit(onProgress, name, 'downloading', 100, 'Model downloaded');

      emit(onProgress, name, 'starting', 0, 'Starting whisper server…');
      startWhisperService(installDir, modelPath);
      emit(onProgress, name, 'done', 100, 'Whisper server started');

      return { service: name, success: true, error: null };
    }

    return { service: name, success: false, error: `No install strategy for service: ${name}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(onProgress, name, 'error', 0, `Install failed: ${message}`);
    // Clean up partial download
    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    return { service: name, success: false, error: message };
  }
}
