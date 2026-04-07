import { shell } from 'electron';
import { platform } from 'os';
import { detectService } from './service-detector';
import type { ServiceName, ServiceInstallInfo, ServiceDetectionResult } from '@aris/shared';

const OS = platform();

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
// Per-service install info builders
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
// Public API
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
 * Used by the wizard to verify that an install succeeded.
 */
export async function verifyInstall(name: ServiceName): Promise<ServiceDetectionResult> {
  return detectService(name);
}
