import { ipcMain } from 'electron'
import { getDatabase } from './database'
import { writeToClipboard } from './clipboard-monitor'

export function setupClipboardHandlers() {
  ipcMain.handle('clipboard:list', (_, limit = 50, offset = 0) => {
    try {
      const db = getDatabase()
      return db.prepare(
        'SELECT * FROM clipboard_items ORDER BY pinned DESC, last_copied_at DESC LIMIT ? OFFSET ?'
      ).all(limit, offset)
    } catch (err) {
      console.error('[ipc] clipboard:list 失败:', err.message)
      return []
    }
  })

  ipcMain.handle('clipboard:search', (_, query) => {
    try {
      const db = getDatabase()
      const q = `%${query}%`
      return db.prepare(
        'SELECT * FROM clipboard_items WHERE content LIKE ? OR preview LIKE ? ORDER BY pinned DESC, last_copied_at DESC LIMIT 100'
      ).all(q, q)
    } catch (err) {
      console.error('[ipc] clipboard:search 失败:', err.message)
      return []
    }
  })

  ipcMain.handle('clipboard:delete', (_, id) => {
    try {
      getDatabase().prepare('DELETE FROM clipboard_items WHERE id = ?').run(id)
      return true
    } catch (err) {
      console.error('[ipc] clipboard:delete 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:togglePin', (_, id) => {
    try {
      const db = getDatabase()
      const item = db.prepare('SELECT pinned FROM clipboard_items WHERE id = ?').get(id)
      if (!item) return false
      db.prepare('UPDATE clipboard_items SET pinned = ? WHERE id = ?').run(item.pinned ? 0 : 1, id)
      return true
    } catch (err) {
      console.error('[ipc] clipboard:togglePin 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:clearAll', () => {
    try {
      getDatabase().prepare('DELETE FROM clipboard_items WHERE pinned = 0').run()
      return true
    } catch (err) {
      console.error('[ipc] clipboard:clearAll 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:paste', (_, id) => {
    try {
      return writeToClipboard(id)
    } catch (err) {
      console.error('[ipc] clipboard:paste 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:stats', () => {
    try {
      const db = getDatabase()
      return db.prepare(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN pinned = 1 THEN 1 ELSE 0 END) AS pinned FROM clipboard_items'
      ).get()
    } catch (err) {
      console.error('[ipc] clipboard:stats 失败:', err.message)
      return { total: 0, pinned: 0 }
    }
  })
}
