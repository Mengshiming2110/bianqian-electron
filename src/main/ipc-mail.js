import { ipcMain } from 'electron'
import { queryAll, queryOne, execute } from './database'
import { MailBridge } from './mail-bridge'

let bridge = null

function normalizeMailConfig(config = {}) {
  const domain = String(config.domain || 'LSTECH').trim() || 'LSTECH'
  const domainUser = String(config.domainUser || config.username || '').trim()
  const email = String(config.email || '').trim()
  const server = String(config.server || '').trim()
  const password = String(config.password || '')

  return {
    server,
    email,
    domain,
    domainUser,
    username: domainUser,
    password,
    smtp: email,
    domain_user: domainUser
  }
}

export function setupMailHandlers() {
  ipcMain.handle('mail:configure', async (_, config) => {
    try {
      if (bridge) bridge.stop()
      bridge = new MailBridge()
      await bridge.start(normalizeMailConfig(config))
      await bridge.fetchMails(null, { throwOnError: true })
      return { ok: true }
    } catch (err) {
      if (bridge) { bridge.stop(); bridge = null }
      console.error('[ipc] mail:configure 失败:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('mail:list', async () => {
    try { return queryAll('SELECT * FROM mail_items ORDER BY received_at DESC LIMIT 100') }
    catch (err) { console.error('[ipc] mail:list 失败:', err.message); return [] }
  })

  ipcMain.handle('mail:fetch', async () => {
    if (!bridge) return []
    try {
      const mails = await bridge.fetchMails()
      if (!Array.isArray(mails) || !mails.length) return []
      for (const m of mails) {
        execute('INSERT OR IGNORE INTO mail_items (id, subject, sender, body, received_at) VALUES (?, ?, ?, ?, ?)',
          [m.id, m.subject || '', m.sender || '', m.body || '', m.received_at || ''])
      }
      return mails
    } catch (err) { console.error('[ipc] mail:fetch 失败:', err.message); return [] }
  })

  ipcMain.handle('mail:detail', async (_, id) => {
    try { return queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || null }
    catch (err) { console.error('[ipc] mail:detail 失败:', err.message); return null }
  })

  ipcMain.handle('mail:stop', () => {
    if (bridge) { bridge.stop(); bridge = null }; return true
  })

  ipcMain.handle('mail:status', () => {
    return { running: bridge !== null }
  })
}

export function stopMailBridge() {
  if (bridge) { bridge.stop(); bridge = null }
}
