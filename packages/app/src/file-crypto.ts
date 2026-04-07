import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { DATA_DIR } from '@aris/shared';

const KEY_FILE = 'encryption.key.enc';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKeyPath(): string {
  return path.join(app.getPath('userData'), DATA_DIR, KEY_FILE);
}

function ensureDir(): void {
  const dir = path.dirname(getKeyPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get or create the app-wide encryption key.
 * Key is stored encrypted via Electron's safeStorage (OS keychain).
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  ensureDir();
  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    if (safeStorage.isEncryptionAvailable()) {
      cachedKey = Buffer.from(safeStorage.decryptString(raw), 'hex');
    } else {
      cachedKey = Buffer.from(raw.toString('utf-8'), 'base64');
    }
    return cachedKey;
  }

  // Generate new 256-bit key
  const newKey = crypto.randomBytes(32);

  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyPath, safeStorage.encryptString(newKey.toString('hex')));
  } else {
    console.warn('[file-crypto] safeStorage unavailable — encryption key stored with base64 only');
    fs.writeFileSync(keyPath, newKey.toString('base64'), 'utf-8');
  }

  cachedKey = newKey;
  return cachedKey;
}

/** Encrypt a buffer. Returns IV (12) + authTag (16) + ciphertext. */
export function encryptBuffer(data: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

/** Decrypt a buffer produced by encryptBuffer. */
export function decryptBuffer(data: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt a UTF-8 string, returning base64. */
export function encryptString(text: string): string {
  return encryptBuffer(Buffer.from(text, 'utf-8')).toString('base64');
}

/** Decrypt a base64 string produced by encryptString. */
export function decryptString(encoded: string): string {
  return decryptBuffer(Buffer.from(encoded, 'base64')).toString('utf-8');
}

/** Overwrite file with random data before unlinking (secure deletion). */
export function secureDelete(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'w');
    fs.writeSync(fd, crypto.randomBytes(stat.size));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}
