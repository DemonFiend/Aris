import { randomUUID } from 'crypto';
import { getDb } from './database';
import { encryptField, decryptField } from './db-crypto';
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
    content: decryptField(row.content),
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
  const lowerQuery = query.toLowerCase();

  // Search conversation titles first (fast, unencrypted)
  const titleMatches = db
    .prepare('SELECT * FROM conversations WHERE title LIKE ? ORDER BY updated_at DESC LIMIT ?')
    .all(`%${query}%`, limit) as ConversationRow[];

  const foundIds = new Set(titleMatches.map((r) => r.id));
  const results = [...titleMatches];

  // Search message content (decrypt and match in memory)
  if (results.length < limit) {
    const convs = db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200')
      .all() as ConversationRow[];

    for (const conv of convs) {
      if (results.length >= limit) break;
      if (foundIds.has(conv.id)) continue;

      const msgs = db
        .prepare('SELECT content FROM messages WHERE conversation_id = ? LIMIT 50')
        .all(conv.id) as Array<{ content: string }>;

      if (msgs.some((m) => decryptField(m.content).toLowerCase().includes(lowerQuery))) {
        results.push(conv);
        foundIds.add(conv.id);
      }
    }
  }

  return results.map(toConversation);
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

  const encryptedContent = encryptField(content);

  db.transaction(() => {
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, conversationId, role, encryptedContent, model ?? null, tokenCount ?? null, now);

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  })();

  return { id, conversationId, role, content, model, tokenCount, createdAt: now };
}
