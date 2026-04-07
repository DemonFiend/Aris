import { access } from 'fs/promises';
import { platform, homedir } from 'os';
import type { ServiceDetectionResult, ServiceName } from '@aris/shared';

const OS = platform();

// ---------------------------------------------------------------------------
// Endpoint probing
// ---------------------------------------------------------------------------

interface ProbeResult {
  ok: boolean;
  body?: unknown;
}

async function probeUrl(url: string, timeoutMs = 2000): Promise<ProbeResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false };
      const body = await res.json().catch(() => null);
      return { ok: true, body };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p);
      return p;
    } catch {
      // not found, try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// LM Studio
// ---------------------------------------------------------------------------

const LM_STUDIO_BASE = 'http://127.0.0.1:1234';
const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE}/api/v1/models`;

function lmStudioInstallPaths(): string[] {
  const home = homedir();
  switch (OS) {
    case 'win32':
      return [
        `${process.env['LOCALAPPDATA'] ?? ''}\\LM-Studio\\LM Studio.exe`,
        `${process.env['LOCALAPPDATA'] ?? ''}\\Programs\\LM Studio\\LM Studio.exe`,
        `${process.env['APPDATA'] ?? ''}\\LM Studio\\LM Studio.exe`,
      ];
    case 'darwin':
      return ['/Applications/LM Studio.app', `${home}/Applications/LM Studio.app`];
    default:
      return [
        `${home}/.local/share/lm-studio/lm-studio`,
        `${home}/.lmstudio/lmstudio`,
        '/usr/bin/lmstudio',
        '/usr/local/bin/lmstudio',
      ];
  }
}

async function detectLMStudio(): Promise<ServiceDetectionResult> {
  const probe = await probeUrl(LM_STUDIO_MODELS_URL);

  let version: string | null = null;
  if (probe.ok && probe.body != null) {
    // LM Studio may embed version in the response object
    const body = probe.body as Record<string, unknown>;
    if (typeof body['version'] === 'string') version = body['version'];
  }

  const installPath = await firstExisting(lmStudioInstallPaths());

  return {
    name: 'lmstudio',
    installed: installPath !== null,
    running: probe.ok,
    version,
    path: installPath,
    endpoint: probe.ok ? LM_STUDIO_BASE : null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Kokoro TTS
// ---------------------------------------------------------------------------

const KOKORO_CANDIDATES = [
  { base: 'http://127.0.0.1:8880', probe: 'http://127.0.0.1:8880/v1/audio/speech' },
  { base: 'http://127.0.0.1:8000', probe: 'http://127.0.0.1:8000/v1/audio/speech' },
];

function kokoroInstallPaths(): string[] {
  const home = homedir();
  switch (OS) {
    case 'win32':
      return [
        `${process.env['LOCALAPPDATA'] ?? ''}\\Kokoro-FastAPI\\run.bat`,
        `${process.env['APPDATA'] ?? ''}\\kokoro\\kokoro.exe`,
      ];
    case 'darwin':
      return ['/Applications/Kokoro.app', `${home}/.local/bin/kokoro`];
    default:
      return [`${home}/.local/bin/kokoro`, '/usr/local/bin/kokoro', '/usr/bin/kokoro'];
  }
}

async function detectKokoro(): Promise<ServiceDetectionResult> {
  let runningBase: string | null = null;

  for (const { base, probe } of KOKORO_CANDIDATES) {
    const result = await probeUrl(probe);
    if (result.ok) {
      runningBase = base;
      break;
    }
  }

  const installPath = await firstExisting(kokoroInstallPaths());

  return {
    name: 'kokoro',
    installed: installPath !== null,
    running: runningBase !== null,
    version: null,
    path: installPath,
    endpoint: runningBase,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Whisper STT
// ---------------------------------------------------------------------------

const WHISPER_CANDIDATES = [
  // whisper.cpp server
  { base: 'http://127.0.0.1:8001', probe: 'http://127.0.0.1:8001/health' },
  // faster-whisper-server
  { base: 'http://127.0.0.1:8000', probe: 'http://127.0.0.1:8000/health' },
  // openai-whisper-webservice
  { base: 'http://127.0.0.1:9000', probe: 'http://127.0.0.1:9000/asr' },
  // whisper-standalone
  { base: 'http://127.0.0.1:43007', probe: 'http://127.0.0.1:43007/health' },
];

function whisperInstallPaths(): string[] {
  const home = homedir();
  switch (OS) {
    case 'win32':
      return [
        `${process.env['LOCALAPPDATA'] ?? ''}\\whisper.cpp\\whisper-server.exe`,
        `${process.env['PROGRAMFILES'] ?? ''}\\whisper\\whisper.exe`,
        `${process.env['APPDATA'] ?? ''}\\whisper\\whisper.exe`,
      ];
    case 'darwin':
      return [
        '/Applications/WhisperTranscription.app',
        `${home}/.local/bin/whisper-server`,
        '/usr/local/bin/whisper-server',
        '/opt/homebrew/bin/whisper-server',
      ];
    default:
      return [
        `${home}/.local/bin/whisper-server`,
        '/usr/local/bin/whisper-server',
        '/usr/bin/whisper-server',
        `${home}/.local/bin/faster-whisper-server`,
      ];
  }
}

async function detectWhisper(): Promise<ServiceDetectionResult> {
  let runningBase: string | null = null;

  for (const { base, probe } of WHISPER_CANDIDATES) {
    const result = await probeUrl(probe);
    if (result.ok) {
      runningBase = base;
      break;
    }
  }

  const installPath = await firstExisting(whisperInstallPaths());

  return {
    name: 'whisper',
    installed: installPath !== null,
    running: runningBase !== null,
    version: null,
    path: installPath,
    endpoint: runningBase,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const OLLAMA_VERSION_URL = `${OLLAMA_BASE}/api/version`;

function ollamaInstallPaths(): string[] {
  const home = homedir();
  switch (OS) {
    case 'win32':
      return [
        `${process.env['LOCALAPPDATA'] ?? ''}\\Programs\\Ollama\\ollama.exe`,
        `${process.env['PROGRAMFILES'] ?? ''}\\Ollama\\ollama.exe`,
        `${process.env['LOCALAPPDATA'] ?? ''}\\Ollama\\ollama.exe`,
      ];
    case 'darwin':
      return ['/Applications/Ollama.app', `${home}/.ollama/ollama`];
    default:
      return [
        '/usr/bin/ollama',
        '/usr/local/bin/ollama',
        `${home}/.local/bin/ollama`,
        '/opt/ollama/ollama',
      ];
  }
}

async function detectOllama(): Promise<ServiceDetectionResult> {
  const probe = await probeUrl(OLLAMA_VERSION_URL);

  let version: string | null = null;
  if (probe.ok && probe.body != null) {
    const body = probe.body as Record<string, unknown>;
    if (typeof body['version'] === 'string') version = body['version'];
  }

  const installPath = await firstExisting(ollamaInstallPaths());

  return {
    name: 'ollama',
    installed: installPath !== null,
    running: probe.ok,
    version,
    path: installPath,
    endpoint: probe.ok ? OLLAMA_BASE : null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DETECTORS: Record<ServiceName, () => Promise<ServiceDetectionResult>> = {
  lmstudio: detectLMStudio,
  kokoro: detectKokoro,
  whisper: detectWhisper,
  ollama: detectOllama,
};

export async function detectService(name: ServiceName): Promise<ServiceDetectionResult> {
  try {
    return await DETECTORS[name]();
  } catch (err) {
    return {
      name,
      installed: false,
      running: false,
      version: null,
      path: null,
      endpoint: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function detectAllServices(): Promise<ServiceDetectionResult[]> {
  return Promise.all((Object.keys(DETECTORS) as ServiceName[]).map((n) => detectService(n)));
}
