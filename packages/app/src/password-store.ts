import * as crypto from 'crypto';
import { getSetting, setSetting, deleteSetting } from './settings-store';
import type { PasswordConfig } from '@aris/shared';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      },
    );
  });
}

function verifyHash(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return resolve(false);
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey));
      },
    );
  });
}

export function getPasswordConfig(): PasswordConfig {
  return {
    enabled: getSetting('password.enabled') === 'true',
    hasPassword: !!getSetting('password.hash'),
    onEnable: getSetting('password.onEnable') === 'true',
    onStart: getSetting('password.onStart') === 'true',
    useSamePassword: getSetting('password.useSamePassword') !== 'false', // default true
    hasStartupPassword: !!getSetting('password.startupHash'),
  };
}

export async function setPassword(password: string): Promise<void> {
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }
  const hash = await hashPassword(password);
  setSetting('password.hash', hash);
  setSetting('password.enabled', 'true');
}

export async function setStartupPassword(password: string): Promise<void> {
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }
  const hash = await hashPassword(password);
  setSetting('password.startupHash', hash);
}

export async function verifyPassword(
  password: string,
  purpose: 'enable' | 'startup',
): Promise<boolean> {
  const config = getPasswordConfig();

  if (purpose === 'startup') {
    // If useSamePassword or no separate startup hash, use main password
    if (config.useSamePassword || !config.hasStartupPassword) {
      const hash = getSetting('password.hash');
      if (!hash) return false;
      return verifyHash(password, hash);
    }
    const startupHash = getSetting('password.startupHash');
    if (!startupHash) return false;
    return verifyHash(password, startupHash);
  }

  // purpose === 'enable'
  const hash = getSetting('password.hash');
  if (!hash) return false;
  return verifyHash(password, hash);
}

export function setPasswordConfig(updates: Partial<PasswordConfig>): void {
  if (updates.enabled !== undefined) {
    setSetting('password.enabled', String(updates.enabled));
  }
  if (updates.onEnable !== undefined) {
    setSetting('password.onEnable', String(updates.onEnable));
  }
  if (updates.onStart !== undefined) {
    setSetting('password.onStart', String(updates.onStart));
  }
  if (updates.useSamePassword !== undefined) {
    setSetting('password.useSamePassword', String(updates.useSamePassword));
    // If switching to same password, clear the separate startup hash
    if (updates.useSamePassword) {
      deleteSetting('password.startupHash');
    }
  }
}

export function removePassword(): void {
  deleteSetting('password.hash');
  deleteSetting('password.startupHash');
  deleteSetting('password.enabled');
  deleteSetting('password.onEnable');
  deleteSetting('password.onStart');
  deleteSetting('password.useSamePassword');
}
