import { clipboard, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { queryAll, queryOne, execute } from './database'

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
  const now = new Date().toISOString()
  const existing = queryOne('SELECT id, copy_count FROM clipboard_items WHERE hash = ?', [item.hash])
  if (existing) {
    execute('UPDATE clipboard_items SET copy_count = ?, last_copied_at = ? WHERE id = ?',
      [existing.copy_count + 1, now, existing.id])
    return existing.id
  }

  const id = randomUUID()
  execute('INSERT INTO clipboard_items (id, type, content, preview, source_app, hash, created_at, last_copied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, item.type, item.content || '', item.preview || '', '', item.hash, now, now])

  // 上限清理
  const { cnt } = queryOne('SELECT COUNT(*) AS cnt FROM clipboard_items') || { cnt: 0 }
  if (cnt > itemLimit) {
    const excess = cnt - itemLimit
    execute('DELETE FROM clipboard_items WHERE pinned = 0 AND rowid IN (SELECT rowid FROM clipboard_items WHERE pinned = 0 ORDER BY last_copied_at ASC LIMIT ?)', [excess])
  }

  // 24h 清理
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  execute('DELETE FROM clipboard_items WHERE pinned = 0 AND last_copied_at < ?', [dayAgo])

  return id
}

function getItemById(id) {
  return queryOne('SELECT * FROM clipboard_items WHERE id = ?', [id])
}

export function startClipboardMonitor(onNewItem) {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    try {
      const item = readClipboard()
      if (!item) return
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
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export function writeToClipboard(id) {
  const item = queryOne('SELECT * FROM clipboard_items WHERE id = ?', [id])
  if (!item) return false
  if (item.type === 'image') {
    clipboard.writeImage(nativeImage.createFromDataURL(item.content))
  } else {
    clipboard.writeText(item.content || '')
  }
  lastSelfPasteHash = item.hash
  execute('UPDATE clipboard_items SET last_copied_at = ? WHERE id = ?', [new Date().toISOString(), id])
  return true
}

export function setClipboardLimit(n) { itemLimit = n }
