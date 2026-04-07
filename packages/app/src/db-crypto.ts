import { app, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '@aris/shared';

const KEY_FILE = 'db-key.enc';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

let cachedKey: Buffer | null = null;

function getKeyPath(): string {
  return path.join(app.getPath('userData'), DATA_DIR, KEY_FILE);
}

/**
 * Get or create the database field encryption key.
 * The key is a random AES-256 key stored encrypted via Electron safeStorage.
 */
export function getDbEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    try {
      const stored = fs.readFileSync(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(stored);
        if (decrypted) {
          cachedKey = Buffer.from(decrypted, 'base64');
        }
      } else {
        cachedKey = Buffer.from(stored.toString('utf-8'), 'base64');
      }
      if (cachedKey && cachedKey.length === 32) return cachedKey;
    } catch {
      // Corrupted key file — regenerate
    }
  }

  const key = crypto.randomBytes(32);
  const dir = path.dirname(keyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key.toString('base64'));
    fs.writeFileSync(keyPath, encrypted);
  } else {
    console.warn('[db-crypto] safeStorage unavailable — key stored with base64 only');
    fs.writeFileSync(keyPath, key.toString('base64'), 'utf-8');
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypt a string field for database storage.
 * Returns a prefixed base64 string: "enc:<iv+tag+ciphertext>"
 */
export function encryptField(plaintext: string): string {
  const key = getDbEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return ENCRYPTED_PREFIX + combined.toString('base64');
}

/**
 * Decrypt a field. If the value is not encrypted (no prefix), returns as-is
 * for backward compatibility with pre-migration plaintext data.
 */
export function decryptField(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const encoded = value.slice(ENCRYPTED_PREFIX.length);
  const buf = Buffer.from(encoded, 'base64');

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted field too short');
  }

  const key = getDbEncryptionKey();
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

/** Check if a value is already encrypted. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
