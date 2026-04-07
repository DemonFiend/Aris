import { app } from 'electron';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { DATA_DIR, DB_FILENAME } from '@aris/shared';
import { encryptField, isEncrypted } from './db-crypto';

let db: Database.Database | null = null;

function getDbPath(): string {
  return path.join(app.getPath('userData'), DATA_DIR, DB_FILENAME);
}

const migrations: Array<{ version: number; up: (db: Database.Database) => void }> = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id              TEXT PRIMARY KEY,
          title           TEXT NOT NULL,
          game_profile_id TEXT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (game_profile_id) REFERENCES game_profiles(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id              TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role            TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
          content         TEXT NOT NULL,
          model           TEXT,
          token_count     INTEGER,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS game_profiles (
          id               TEXT PRIMARY KEY,
          name             TEXT NOT NULL,
          executable_path  TEXT,
          system_prompt    TEXT,
          capture_enabled  INTEGER NOT NULL DEFAULT 0,
          created_at       TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content=messages, content_rowid=rowid);

        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      // Remove FTS triggers and table — encrypted content cannot be indexed in plaintext
      db.exec(`
        DROP TRIGGER IF EXISTS messages_ai;
        DROP TRIGGER IF EXISTS messages_ad;
        DROP TRIGGER IF EXISTS messages_au;
        DROP TABLE IF EXISTS messages_fts;
      `);

      // Encrypt existing plaintext message content
      const messages = db.prepare('SELECT id, content FROM messages').all() as Array<{
        id: string;
        content: string;
      }>;
      const updateMsg = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
      for (const msg of messages) {
        if (!isEncrypted(msg.content)) {
          updateMsg.run(encryptField(msg.content), msg.id);
        }
      }

      // Encrypt existing plaintext game profile system prompts
      const profiles = db
        .prepare('SELECT id, system_prompt FROM game_profiles WHERE system_prompt IS NOT NULL')
        .all() as Array<{ id: string; system_prompt: string }>;
      const updateProfile = db.prepare(
        'UPDATE game_profiles SET system_prompt = ? WHERE id = ?',
      );
      for (const profile of profiles) {
        if (!isEncrypted(profile.system_prompt)) {
          updateProfile.run(encryptField(profile.system_prompt), profile.id);
        }
      }
    },
  },
];

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as
    | { v: number | null }
    | undefined;
  const currentVersion = row?.v ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      })();
    }
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // Checkpoint WAL to flush pending writes and clean up crash-leftover files
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function deleteDatabase(): void {
  closeDb();
  const dbPath = getDbPath();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
