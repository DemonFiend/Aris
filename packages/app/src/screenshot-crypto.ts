import { app, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '@aris/shared';

const KEY_FILE = 'screenshot-key.enc';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKeyPath(): string {
  return path.join(app.getPath('userData'), DATA_DIR, KEY_FILE);
}

function generateKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Get or create the screenshot encryption key.
 * The key is a random AES-256 key stored encrypted via Electron safeStorage.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    try {
      const stored = fs.readFileSync(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        cachedKey = safeStorage.decryptString(stored)
          ? Buffer.from(safeStorage.decryptString(stored), 'base64')
          : null;
      } else {
        // Fallback: base64-only (not truly secure, but matches key-store behavior)
        cachedKey = Buffer.from(stored.toString('utf-8'), 'base64');
      }
      if (cachedKey && cachedKey.length === 32) return cachedKey;
    } catch {
      // Corrupted key file — regenerate
    }
  }

  // Generate new key
  const key = generateKey();
  const dir = path.dirname(keyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key.toString('base64'));
    fs.writeFileSync(keyPath, encrypted);
  } else {
    console.warn('[screenshot-crypto] safeStorage unavailable — key stored with base64 only');
    fs.writeFileSync(keyPath, key.toString('base64'), 'utf-8');
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypt a screenshot buffer using AES-256-GCM.
 * Returns: [IV (12 bytes)][auth tag (16 bytes)][ciphertext]
 */
export function encryptScreenshot(plainBuffer: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt an encrypted screenshot buffer.
 * Expects: [IV (12 bytes)][auth tag (16 bytes)][ciphertext]
 */
export function decryptScreenshot(encBuffer: Buffer): Buffer {
  if (encBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted buffer too short');
  }

  const key = getEncryptionKey();
  const iv = encBuffer.subarray(0, IV_LENGTH);
  const authTag = encBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Securely delete a file by overwriting with random bytes before unlinking.
 */
export function secureDelete(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    const randomData = crypto.randomBytes(stat.size);
    const fd = fs.openSync(filePath, 'w');
    fs.writeSync(fd, randomData);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort: fall back to plain unlink
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may already be gone
    }
  }
}
