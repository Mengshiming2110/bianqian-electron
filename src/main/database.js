import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

let db = null

export function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'clipboard.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      preview TEXT,
      source_app TEXT DEFAULT '',
      hash TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      copy_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_copied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clipboard_hash
      ON clipboard_items(hash);
    CREATE INDEX IF NOT EXISTS idx_clipboard_created
      ON clipboard_items(created_at DESC);

    CREATE TABLE IF NOT EXISTS mail_items (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      body TEXT DEFAULT '',
      received_at TEXT NOT NULL DEFAULT '',
      is_read INTEGER DEFAULT 0,
      extracted_fields TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_mail_received
      ON mail_items(received_at DESC);
  `)

  console.log('[database] 初始化, 路径:', dbPath)
}

export function getDatabase() {
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
