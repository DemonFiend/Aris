import { randomUUID } from 'crypto';
import { getDb } from './database';
import type { Conversation, StoredMessage } from '@aris/shared';

interface ConversationRow {
  id: string;
  title: string;
  game_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  model: string | null;
  token_count: number | null;
  created_at: string;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    gameProfileId: row.game_profile_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    model: row.model ?? undefined,
    tokenCount: row.token_count ?? undefined,
    createdAt: row.created_at,
  };
}

export function listConversations(limit = 50, offset = 0): Conversation[] {
  const rows = getDb()
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as ConversationRow[];
  return rows.map(toConversation);
}

export function getConversation(id: string): Conversation | undefined {
  const row = getDb()
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined;
  return row ? toConversation(row) : undefined;
}

export function createConversation(title: string, gameProfileId?: string): Conversation {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      'INSERT INTO conversations (id, title, game_profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, title, gameProfileId ?? null, now, now);
  return { id, title, gameProfileId, createdAt: now, updatedAt: now };
}

export function deleteConversation(id: string): boolean {
  const result = getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function searchConversations(query: string, limit = 20): Conversation[] {
  const db = getDb();
  const messageHits = db
    .prepare(
      `SELECT DISTINCT m.conversation_id
       FROM messages_fts fts
       JOIN messages m ON m.rowid = fts.rowid
       WHERE messages_fts MATCH ?
       LIMIT ?`,
    )
    .all(query, limit) as Array<{ conversation_id: string }>;

  if (messageHits.length === 0) return [];

  const ids = messageHits.map((r) => r.conversation_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM conversations WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
    )
    .all(...ids) as ConversationRow[];
  return rows.map(toConversation);
}

export function listMessages(conversationId: string): StoredMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as MessageRow[];
  return rows.map(toMessage);
}

export function addMessage(
  conversationId: string,
  role: 'system' | 'user' | 'assistant',
  content: string,
  model?: string,
  tokenCount?: number,
): StoredMessage {
  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDb();

  db.transaction(() => {
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, conversationId, role, content, model ?? null, tokenCount ?? null, now);

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  })();

  return { id, conversationId, role, content, model, tokenCount, createdAt: now };
}
