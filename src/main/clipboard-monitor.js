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

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
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
    const plainText = clipboard.readText().trim() || htmlToPlainText(html)
    if (!plainText) return null
    const h = hashContent(plainText)
    if (h === lastHash) return null
    return { type: 'text', content: plainText, preview: plainText.slice(0, 200), hash: h }
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
  lastSelfPasteHash = ''
}

export function writeToClipboard(id) {
  const item = queryOne('SELECT * FROM clipboard_items WHERE id = ?', [id])
  if (!item) return false
  if (item.type === 'image') {
    clipboard.writeImage(nativeImage.createFromDataURL(item.content))
    lastSelfPasteHash = item.hash
  } else {
    const text = item.content || ''
    clipboard.writeText(text)
    lastSelfPasteHash = hashContent(text)
  }
  return true
}

export function setClipboardLimit(n) { itemLimit = n }
