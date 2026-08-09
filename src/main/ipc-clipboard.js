import { ipcMain } from 'electron'
import { queryAll, queryOne, execute } from './database'
import { writeToClipboard } from './clipboard-monitor'

export function setupClipboardHandlers() {
  ipcMain.handle('clipboard:list', (_, limit = 50, offset = 0) => {
    try {
      const lim = Number.isFinite(Number(limit)) ? Number(limit) : 50
      const off = Number.isFinite(Number(offset)) ? Number(offset) : 0
      return queryAll('SELECT * FROM clipboard_items ORDER BY pinned DESC, last_copied_at DESC LIMIT ? OFFSET ?', [lim, off])
    } catch (err) { console.error('[ipc] clipboard:list 失败:', err.message); return [] }
  })

  ipcMain.handle('clipboard:search', (_, query) => {
    try {
      const q = `%${query == null ? '' : query}%`
      return queryAll('SELECT * FROM clipboard_items WHERE content LIKE ? OR preview LIKE ? ORDER BY pinned DESC, last_copied_at DESC LIMIT 100', [q, q])
    } catch (err) { console.error('[ipc] clipboard:search 失败:', err.message); return [] }
  })

  ipcMain.handle('clipboard:delete', (_, id) => {
    try { execute('DELETE FROM clipboard_items WHERE id = ?', [id]); return true }
    catch (err) { console.error('[ipc] clipboard:delete 失败:', err.message); return false }
  })

  ipcMain.handle('clipboard:togglePin', (_, id) => {
    try {
      const item = queryOne('SELECT pinned FROM clipboard_items WHERE id = ?', [id])
      if (!item) return false
      execute('UPDATE clipboard_items SET pinned = ? WHERE id = ?', [item.pinned ? 0 : 1, id])
      return true
    } catch (err) { console.error('[ipc] clipboard:togglePin 失败:', err.message); return false }
  })

  ipcMain.handle('clipboard:clearAll', () => {
    try { execute('DELETE FROM clipboard_items WHERE pinned = 0'); return true }
    catch (err) { console.error('[ipc] clipboard:clearAll 失败:', err.message); return false }
  })

  ipcMain.handle('clipboard:paste', (_, id) => {
    try { return writeToClipboard(id) }
    catch (err) { console.error('[ipc] clipboard:paste 失败:', err.message); return false }
  })

  ipcMain.handle('clipboard:stats', () => {
    try {
      return queryOne('SELECT COUNT(*) AS total, SUM(CASE WHEN pinned = 1 THEN 1 ELSE 0 END) AS pinned FROM clipboard_items') || { total: 0, pinned: 0 }
    } catch (err) { console.error('[ipc] clipboard:stats 失败:', err.message); return { total: 0, pinned: 0 } }
  })
}
