import { clipboard, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { getDatabase } from './database'

let pollTimer = null
let lastHash = ''
let lastSelfPasteHash = ''
let itemLimit = 50

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function readClipboard() {
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    const dataUrl = img.toDataURL()
    const h = hashContent(dataUrl)
    if (h === lastHash) return null
    return { type: 'image', content: dataUrl, hash: h }
  }

  const html = clipboard.readHTML()
  if (html && html.trim()) {
    const h = hashContent(html)
    if (h === lastHash) return null
    const text = html.replace(/<[^>]+>/g, '').trim().slice(0, 200)
    return { type: 'html', content: html, preview: text, hash: h }
  }

  const text = clipboard.readText()
  if (text && text.trim()) {
    const h = hashContent(text)
    if (h === lastHash) return null
    return { type: 'text', content: text, preview: text.slice(0, 200), hash: h }
  }

  return null
}

function saveItem(item) {
  const db = getDatabase()
  const now = new Date().toISOString()

  const existing = db.prepare('SELECT id, copy_count FROM clipboard_items WHERE hash = ?').get(item.hash)
  if (existing) {
    db.prepare('UPDATE clipboard_items SET copy_count = ?, last_copied_at = ? WHERE id = ?')
      .run(existing.copy_count + 1, now, existing.id)
    return existing.id
  }

  const id = randomUUID()
  db.prepare(`
    INSERT INTO clipboard_items (id, type, content, preview, source_app, hash, created_at, last_copied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, item.type, item.content || '', item.preview || '', '', item.hash, now, now)

  // 上限清理：超出 itemLimit 时删除最旧的非固定项
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM clipboard_items').get().cnt
  if (count > itemLimit) {
    const excess = count - itemLimit
    db.prepare(`
      DELETE FROM clipboard_items WHERE pinned = 0 AND id IN (
        SELECT id FROM clipboard_items WHERE pinned = 0 ORDER BY last_copied_at ASC LIMIT ?
      )
    `).run(excess)
  }

  // 24h 自动清理
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  db.prepare('DELETE FROM clipboard_items WHERE pinned = 0 AND last_copied_at < ?').run(dayAgo)

  return id
}

function getItemById(id) {
  const db = getDatabase()
  return db.prepare('SELECT * FROM clipboard_items WHERE id = ?').get(id) || null
}

export function startClipboardMonitor(onNewItem) {
  if (pollTimer) return

  pollTimer = setInterval(() => {
    try {
      const item = readClipboard()
      if (!item) return

      // 自粘贴忽略：应用自己写回的内容跳过
      if (lastSelfPasteHash && item.hash === lastSelfPasteHash) {
        lastSelfPasteHash = ''
        lastHash = item.hash
        return
      }

      lastHash = item.hash
      const id = saveItem(item)
      if (id && onNewItem) {
        const full = getItemById(id)
        if (full) onNewItem(full)
      }
    } catch (err) {
      console.error('[clipboard-monitor] error:', err.message)
    }
  }, 500)
}

export function stopClipboardMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function writeToClipboard(id) {
  const db = getDatabase()
  const item = db.prepare('SELECT * FROM clipboard_items WHERE id = ?').get(id)
  if (!item) return false

  if (item.type === 'image') {
    clipboard.writeImage(nativeImage.createFromDataURL(item.content))
  } else {
    clipboard.writeText(item.content || '')
  }

  // 标记自粘贴，防止下个轮询周期重复记录
  lastSelfPasteHash = item.hash

  db.prepare('UPDATE clipboard_items SET last_copied_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  return true
}

export function setClipboardLimit(n) {
  itemLimit = n
}
