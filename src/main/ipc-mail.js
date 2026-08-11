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

// 详情写库：is_read 用 MAX 合并，预热（markRead=false）不会把已读回退
function upsertMail(next, options = {}) {
  const markRead = options.markRead !== false
  execute(
    `INSERT INTO mail_items (id, subject, sender, body, html, received_at, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       subject = excluded.subject,
       sender = excluded.sender,
       body = excluded.body,
       html = excluded.html,
       received_at = excluded.received_at,
       is_read = MAX(mail_items.is_read, excluded.is_read)`,
    [
      next.id,
      next.subject || '',
      next.sender || '',
      next.body || '',
      next.html || '',
      next.received_at || next.datetime_received || '',
      markRead ? 1 : 0
    ]
  )
}

// 预加载：后台预热最近几封未拉过详情的邮件，点击时缓存已就绪直接秒开完整内容
function warmUpDetails(bridge, limit = 3) {
  try {
    const toWarm = queryAll(`SELECT id FROM mail_items WHERE html = '' ORDER BY received_at DESC LIMIT ${limit}`)
    for (const { id } of toWarm) {
      bridge.fetchMailDetail(id)
        .then((detail) => {
          if (!detail) return
          upsertMail({ ...detail, id }, { markRead: false })
        })
        .catch(() => {})
    }
  } catch (err) {
    console.warn('[ipc] mail 详情预热失败:', err.message)
  }
}

export function setupMailHandlers() {
  ipcMain.handle('mail:configure', async (_, config) => {
    try {
      if (bridge) await bridge.stop()
      bridge = new MailBridge()
      await bridge.start(normalizeMailConfig(config))
      // 预热拉取：/start 已校验账号密码，此处失败基本是瞬时网络问题，不阻断配置成功
      try {
        await bridge.fetchMails(null, { throwOnError: true })
      } catch (err) {
        console.warn('[ipc] mail:configure 预热拉取失败（稍后自动重试）:', err.message)
      }
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
             html = excluded.html,
             received_at = excluded.received_at,
             is_read = excluded.is_read`,
          [m.id, m.subject || '', m.sender || '', m.body || m.preview || '', m.html || '', m.received_at || '', m.is_read ? 1 : 0]
        )
      }
      // 预加载：拉完列表后台预热详情，点开即完整内容（不标记已读）
      warmUpDetails(bridge)
      return mails
    } catch (err) {
      console.error('[ipc] mail:fetch 失败:', err.message)
      throw err
    }
  })

  ipcMain.handle('mail:doctor', async (_, config) => {
    try {
      // 运行中的服务直接诊断（环境变量即当前配置），不打断现有连接
      if (bridge && bridge.process) {
        return await bridge.doctor()
      }
      // 未运行：临时拉起诊断，完事即停，不留僵尸进程
      const temp = new MailBridge()
      try {
        await temp.start(normalizeMailConfig(config), { configure: false })
        return await temp.doctor()
      } finally {
        temp.stop()
      }
    } catch (err) {
      console.error('[ipc] mail:doctor 失败:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // 诊断后修复：reconnect=重连 Exchange；restart=重启服务进程
  ipcMain.handle('mail:fix', async (_, action) => {
    if (!bridge) return { ok: false, error: '邮件服务未启动' }
    return await bridge.fix(action)
  })

  // 当前连接配置（不含密码），供 UI/Zcode 确认连接目标
  ipcMain.handle('mail:config', () => {
    if (!bridge || !bridge.config) return null
    const { password, ...safe } = bridge.config
    return safe
  })

  ipcMain.handle('mail:detail', async (event, id) => {
    try {
      const cached = queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || null
      if (!bridge) return cached

      // 秒回缓存：弹层立即打开；网络详情后台拉取，完成后推送渲染层自动更新
      const sender = event.sender
      bridge.fetchMailDetail(id)
        .then((detail) => {
          if (!detail) return
          const next = {
            ...(cached || {}),
            ...detail,
            id,
            body: detail.body || cached?.body || '',
            html: detail.html || cached?.html || ''
          }
          upsertMail(next)
          if (!sender.isDestroyed()) {
            sender.send('mail:detail-updated', queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || next)
          }
        })
        .catch((err) => console.warn('[ipc] mail:detail 后台刷新失败:', err.message))
      return cached
    } catch (err) {
      console.error('[ipc] mail:detail 失败:', err.message)
      return queryOne('SELECT * FROM mail_items WHERE id = ?', [id]) || null
    }
  })

  ipcMain.handle('mail:stop', () => {
    if (bridge) { bridge.stop(); bridge = null }; return true
  })

  ipcMain.handle('mail:status', () => {
    return bridge ? bridge.getStatus() : { running: false, connected: false, error: '邮件服务未启动' }
  })

  // 附件列表 — 有 MailService 时从 bridge 获取，否则返回空
  ipcMain.handle('mail:attachments', async (_, mailId) => {
    if (bridge) {
      try {
        return await bridge.listAttachments(mailId)
      } catch (err) {
        console.error('[ipc] mail:attachments 失败:', err.message)
      }
    }
    return []
  })

  // 附件内容 — 有 MailService 时从 bridge 下载，否则返回 null
  ipcMain.handle('mail:attachment-content', async (_, mailId, filename) => {
    if (bridge) {
      try {
        const content = await bridge.downloadAttachment(mailId, filename)
        if (content) return content
      } catch (err) {
        console.error('[ipc] mail:attachment-content 失败:', err.message)
      }
    }
    return null
  })
}

export function stopMailBridge() {
  if (bridge) { bridge.stop(); bridge = null }
}
