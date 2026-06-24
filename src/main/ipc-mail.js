import { ipcMain } from 'electron'
import { queryAll, queryOne, execute } from './database'
import { MailBridge } from './mail-bridge'

let bridge = null
const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const DEFAULT_MAIL_DOMAIN = 'LSTECH'

function normalizeMailConfig(config = {}) {
  const domain = String(config.domain || DEFAULT_MAIL_DOMAIN).trim() || DEFAULT_MAIL_DOMAIN
  const domainUser = String(config.domainUser || config.username || '').trim()
  const email = String(config.email || '').trim()
  const server = String(config.server || DEFAULT_MAIL_SERVER).trim() || DEFAULT_MAIL_SERVER
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
      const mails = await bridge.fetchMails(null, { throwOnError: true })
      if (!Array.isArray(mails) || !mails.length) return []
      for (const m of mails) {
        execute(
          `INSERT INTO mail_items (id, subject, sender, body, html, received_at, is_read)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             subject = excluded.subject,
             sender = excluded.sender,
             body = excluded.body,
             received_at = excluded.received_at`,
          [m.id, m.subject || '', m.sender || '', m.body || m.preview || '', m.html || '', m.received_at || '', m.is_read ? 1 : 0]
        )
      }
      return mails
    } catch (err) {
      console.error('[ipc] mail:fetch 失败:', err.message)
      throw err
    }
  })

  ipcMain.handle('mail:doctor', async (_, config) => {
    try {
      if (bridge) {
        bridge.stop()
        bridge = null
      }
      bridge = new MailBridge()
      await bridge.start(normalizeMailConfig(config), { configure: false })
      return await bridge.doctor()
    } catch (err) {
      console.error('[ipc] mail:doctor 失败:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('mail:detail', async (_, id) => {
    try {
      const cached = queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || null
      if (!bridge) return cached

      const detail = await bridge.fetchMailDetail(id)
      if (!detail) return cached

      const next = {
        ...(cached || {}),
        ...detail,
        id,
        body: detail.body || cached?.body || '',
        html: detail.html || cached?.html || ''
      }

      execute(
        `INSERT INTO mail_items (id, subject, sender, body, html, received_at, is_read)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           subject = excluded.subject,
           sender = excluded.sender,
           body = excluded.body,
           html = excluded.html,
           received_at = excluded.received_at,
           is_read = 1`,
        [
          next.id,
          next.subject || '',
          next.sender || '',
          next.body || '',
          next.html || '',
          next.received_at || next.datetime_received || '',
          1
        ]
      )
      return queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || next
    } catch (err) {
      console.error('[ipc] mail:detail 失败:', err.message)
      return queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || null
    }
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
