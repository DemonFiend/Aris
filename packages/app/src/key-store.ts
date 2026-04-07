import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { ProviderConfig } from '@aris/shared';
import { DATA_DIR } from '@aris/shared';

const CONFIG_FILE = 'provider-configs.enc.json';

function getConfigPath(): string {
  return path.join(app.getPath('userData'), DATA_DIR, CONFIG_FILE);
}

function ensureDir(): void {
  const dir = path.dirname(getConfigPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Whether the OS keychain is available for real encryption */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

function encryptString(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  // Fallback: base64 is NOT encryption — caller should warn the user
  console.warn('[key-store] safeStorage unavailable — API keys stored with base64 encoding only');
  return Buffer.from(value).toString('base64');
}

function decryptString(encoded: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  }
  return Buffer.from(encoded, 'base64').toString();
}

/** Validate that a provider base URL is safe (HTTPS or localhost) */
export function validateProviderUrl(url: string | undefined): void {
  if (!url) return;
  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    if (parsed.protocol === 'http:' && !isLocal) {
      throw new Error(
        `Insecure HTTP URL rejected: ${parsed.hostname}. Use HTTPS for remote endpoints, or localhost for local servers.`,
      );
    }
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`Invalid URL: ${url}`);
    }
    throw e;
  }
}

interface StoredConfig {
  id: string;
  enabled: boolean;
  encryptedApiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export function loadProviderConfigs(): ProviderConfig[] {
  ensureDir();
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return [];

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const stored: StoredConfig[] = JSON.parse(raw);
    return stored.map((s) => ({
      id: s.id,
      enabled: s.enabled,
      apiKey: s.encryptedApiKey ? decryptString(s.encryptedApiKey) : undefined,
      baseUrl: s.baseUrl,
      defaultModel: s.defaultModel,
    }));
  } catch {
    return [];
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  validateProviderUrl(config.baseUrl);
  ensureDir();
  const configPath = getConfigPath();
  const configs = loadProviderConfigs();

  const existing = configs.findIndex((c) => c.id === config.id);
  if (existing >= 0) {
    configs[existing] = config;
  } else {
    configs.push(config);
  }

  const stored: StoredConfig[] = configs.map((c) => ({
    id: c.id,
    enabled: c.enabled,
    encryptedApiKey: c.apiKey ? encryptString(c.apiKey) : undefined,
    baseUrl: c.baseUrl,
    defaultModel: c.defaultModel,
  }));

  fs.writeFileSync(configPath, JSON.stringify(stored, null, 2));
}

export function getProviderConfig(id: string): ProviderConfig | undefined {
  return loadProviderConfigs().find((c) => c.id === id);
}
