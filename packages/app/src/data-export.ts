import { getDb, deleteDatabase } from './database';

export interface ExportData {
  version: 1;
  exportedAt: string;
  settings: Record<string, string>;
  conversations: Array<{
    id: string;
    title: string;
    gameProfileId: string | null;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      role: string;
      content: string;
      model: string | null;
      tokenCount: number | null;
      createdAt: string;
    }>;
  }>;
  gameProfiles: Array<{
    id: string;
    name: string;
    executablePath: string | null;
    systemPrompt: string | null;
    captureEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export function exportAllData(): ExportData {
  const db = getDb();

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const row of settingsRows) {
    settings[row.key] = row.value;
  }

  const convRows = db.prepare('SELECT * FROM conversations ORDER BY created_at ASC').all() as Array<{
    id: string;
    title: string;
    game_profile_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversations = convRows.map((c) => {
    const msgRows = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(c.id) as Array<{
      role: string;
      content: string;
      model: string | null;
      token_count: number | null;
      created_at: string;
    }>;
    return {
      id: c.id,
      title: c.title,
      gameProfileId: c.game_profile_id,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messages: msgRows.map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model,
        tokenCount: m.token_count,
        createdAt: m.created_at,
      })),
    };
  });

  const profileRows = db
    .prepare('SELECT * FROM game_profiles ORDER BY name ASC')
    .all() as Array<{
    id: string;
    name: string;
    executable_path: string | null;
    system_prompt: string | null;
    capture_enabled: number;
    created_at: string;
    updated_at: string;
  }>;

  const gameProfiles = profileRows.map((p) => ({
    id: p.id,
    name: p.name,
    executablePath: p.executable_path,
    systemPrompt: p.system_prompt,
    captureEnabled: p.capture_enabled === 1,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    conversations,
    gameProfiles,
  };
}

export function wipeAllData(): void {
  deleteDatabase();
}
