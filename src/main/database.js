/**
 * SQLite 数据库 — sql.js (纯 JS WebAssembly, 免编译)
 */
import initSqlJs from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

let db = null
let dbPath = ''

async function ensureDir(p) {
  const d = dirname(p)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

export async function initDatabase() {
  const SQL = await initSqlJs()
  dbPath = join(app.getPath('userData'), 'clipboard.db')
  ensureDir(dbPath)

  if (existsSync(dbPath)) {
    const buf = readFileSync(dbPath)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA synchronous = NORMAL')

  db.run(`CREATE TABLE IF NOT EXISTS clipboard_items (id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'text', content TEXT, preview TEXT, source_app TEXT DEFAULT '', hash TEXT NOT NULL, pinned INTEGER DEFAULT 0, copy_count INTEGER DEFAULT 1, created_at TEXT NOT NULL, last_copied_at TEXT NOT NULL)`)
  db.run('CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_items(hash)')
  db.run('CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard_items(created_at)')
  db.run(`CREATE TABLE IF NOT EXISTS mail_items (id TEXT PRIMARY KEY, subject TEXT NOT NULL DEFAULT '', sender TEXT NOT NULL DEFAULT '', body TEXT DEFAULT '', html TEXT DEFAULT '', received_at TEXT NOT NULL DEFAULT '', is_read INTEGER DEFAULT 0, extracted_fields TEXT DEFAULT '{}')`)
  ensureColumn('mail_items', 'html', "TEXT DEFAULT ''")
  db.run('CREATE INDEX IF NOT EXISTS idx_mail_received ON mail_items(received_at)')

  persist()
  console.log('[database] 初始化, 路径:', dbPath)
}

function ensureColumn(table, column, definition) {
  try {
    const columns = queryAll(`PRAGMA table_info(${table})`)
    if (!columns.some((item) => item.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  } catch (err) {
    console.error('[database] ensureColumn:', err.message)
  }
}

function persist() {
  if (!db || !dbPath) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export function queryAll(sql, params = []) {
  if (!db) return []
  let stmt
  try {
    stmt = db.prepare(sql)
    if (params.length) stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } catch (err) { console.error('[db] queryAll:', err.message); return [] }
  finally {
    if (stmt) stmt.free()
  }
}

export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

export function execute(sql, params = []) {
  if (!db) return { changes: 0 }
  try {
    db.run(sql, params)
    persist()
    return { changes: db.getRowsModified() }
  } catch (err) { console.error('[db] execute:', err.message); return { changes: 0 } }
}

export function closeDatabase() {
  if (db) { persist(); db.close(); db = null }
}
