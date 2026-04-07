import { randomUUID } from 'crypto';
import { getDb } from './database';
import { encryptField, decryptField } from './db-crypto';
import type { GameProfile } from '@aris/shared';

interface GameProfileRow {
  id: string;
  name: string;
  executable_path: string | null;
  system_prompt: string | null;
  capture_enabled: number;
  created_at: string;
  updated_at: string;
}

function toGameProfile(row: GameProfileRow): GameProfile {
  return {
    id: row.id,
    name: row.name,
    executablePath: row.executable_path ?? undefined,
    systemPrompt: row.system_prompt ? decryptField(row.system_prompt) : undefined,
    captureEnabled: row.capture_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listGameProfiles(): GameProfile[] {
  const rows = getDb()
    .prepare('SELECT * FROM game_profiles ORDER BY name ASC')
    .all() as GameProfileRow[];
  return rows.map(toGameProfile);
}

export function getGameProfile(id: string): GameProfile | undefined {
  const row = getDb()
    .prepare('SELECT * FROM game_profiles WHERE id = ?')
    .get(id) as GameProfileRow | undefined;
  return row ? toGameProfile(row) : undefined;
}

export function createGameProfile(
  name: string,
  opts?: { executablePath?: string; systemPrompt?: string; captureEnabled?: boolean },
): GameProfile {
  const id = randomUUID();
  const now = new Date().toISOString();
  const encPrompt = opts?.systemPrompt ? encryptField(opts.systemPrompt) : null;
  getDb()
    .prepare(
      'INSERT INTO game_profiles (id, name, executable_path, system_prompt, capture_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      name,
      opts?.executablePath ?? null,
      encPrompt,
      opts?.captureEnabled ? 1 : 0,
      now,
      now,
    );
  return {
    id,
    name,
    executablePath: opts?.executablePath,
    systemPrompt: opts?.systemPrompt,
    captureEnabled: opts?.captureEnabled ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateGameProfile(
  id: string,
  updates: Partial<Pick<GameProfile, 'name' | 'executablePath' | 'systemPrompt' | 'captureEnabled'>>,
): GameProfile | undefined {
  const existing = getGameProfile(id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const name = updates.name ?? existing.name;
  const executablePath = updates.executablePath ?? existing.executablePath;
  const systemPrompt = updates.systemPrompt ?? existing.systemPrompt;
  const captureEnabled = updates.captureEnabled ?? existing.captureEnabled;

  const encPrompt = systemPrompt ? encryptField(systemPrompt) : null;
  getDb()
    .prepare(
      'UPDATE game_profiles SET name = ?, executable_path = ?, system_prompt = ?, capture_enabled = ?, updated_at = ? WHERE id = ?',
    )
    .run(name, executablePath ?? null, encPrompt, captureEnabled ? 1 : 0, now, id);

  return { id, name, executablePath, systemPrompt, captureEnabled, createdAt: existing.createdAt, updatedAt: now };
}

export function deleteGameProfile(id: string): boolean {
  const result = getDb().prepare('DELETE FROM game_profiles WHERE id = ?').run(id);
  return result.changes > 0;
}
