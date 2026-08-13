import { defineStore } from 'pinia'

const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const DEFAULT_MAIL_DOMAIN = 'LSTECH'
const DEFAULT_MAIL_INTERVAL_MINUTES = 5

let autoFetchTimer = null
let autoFetchInFlight = false
let quickRetryTimer = null
let quickRetryCount = 0
let mailIntervalMinutes = DEFAULT_MAIL_INTERVAL_MINUTES

const QUICK_RETRY_DELAY_MS = 30000
const QUICK_RETRY_MAX = 5

function normalizeMailInterval(value) {
  const minutes = Number(value)
  return [1, 5, 15, 30].includes(minutes) ? minutes : DEFAULT_MAIL_INTERVAL_MINUTES
}

export const useMailStore = defineStore('mail', {
  state: () => ({
    mails: [],
    selectedMail: null,
    isRunning: false,
    connected: false,
    configured: false,
    error: null,
    doctorResult: null,
    doctorRunning: false
  }),

  actions: {
    async configure(config) {
      const payload = {
        server: String(config?.server || DEFAULT_MAIL_SERVER).trim() || DEFAULT_MAIL_SERVER,
        email: String(config?.email || '').trim(),
        domainUser: String(config?.domainUser || config?.username || '').trim(),
        domain: String(config?.domain || DEFAULT_MAIL_DOMAIN).trim() || DEFAULT_MAIL_DOMAIN,
        password: String(config?.password || '')
      }
      this.error = null
      try {
        const result = await window.api.mail.configure(payload)
        if (result?.ok) {
          this.configured = true
          this.isRunning = true
          this.connected = true
          await this.fetch()
          await this.startAutoFetch()
        } else {
          this.configured = false
          this.isRunning = false
          this.connected = false
          this.stopAutoFetch()
          this.error = this.mapError(result?.error || '连接失败')
        }
        return result
      } catch (err) {
        this.configured = false
        this.isRunning = false
        this.connected = false
        this.stopAutoFetch()
        this.error = this.mapError(err?.message || err || '连接失败')
        return { ok: false, error: this.error }
      }
    },

    mapError(raw) {
      if (!raw) return '连接失败，请检查网络'
      const msg = String(raw).toLowerCase()
      if (msg.includes('邮件服务不存在') || msg.includes('mailservice'))
        return '邮件服务组件缺失，请确认安装包包含 MailService.exe'
      if (msg.includes('无响应') || msg.includes('无法响应'))
        return '邮件服务无响应，正在自动重启恢复，请稍后刷新'
      if (msg.includes('已断开') || msg.includes('重连') || msg.includes('冷却'))
        return '邮箱连接暂时中断，正在自动重连，请保持公司网络或 VPN 连接'
      if (msg.includes('dns') || msg.includes('enotfound') || msg.includes('getaddrinfo'))
        return '服务器 DNS 解析失败，请检查 Exchange 地址或公司网络'
      if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('无法连接'))
        return '无法连到 Exchange 服务器 443 端口，请确认已连接公司网络或 VPN'
      if (msg.includes('password') || msg.includes('auth') || msg.includes('401') || msg.includes('403'))
        return '密码错误或账号被锁定，请重新输入密码'
      if (msg.includes('unauthorized') || msg.includes('access denied') || msg.includes('forbidden'))
        return '账号无权访问 EWS，请联系 IT 确认 Exchange/EWS 权限'
      if (msg.includes('domain_user') || msg.includes('域账号'))
        return 'AD 账号或 AD 域不正确，请检查公司登录账号'
      if (msg.includes('not found') || msg.includes('404'))
        return 'EWS 地址不可用，请检查 Exchange 服务器地址'
      return `连接失败：${raw}`
    },

    async load() {
      try {
        this.mails = await window.api.mail.list() || []
        const status = await window.api.mail.status()
        this.isRunning = status?.running || false
        this.connected = status?.connected || false
        this.configured = this.isRunning
        if (this.isRunning) {
          await this.startAutoFetch()
        } else {
          this.stopAutoFetch()
        }
      } catch (err) {
        this.error = this.mapError(err?.message || err || '邮件状态读取失败')
        this.isRunning = false
        this.connected = false
        this.configured = false
        this.stopAutoFetch()
      }
    },

    async fetch() {
      if (autoFetchInFlight) return
      autoFetchInFlight = true
      try {
        await window.api.mail.fetch()
        await this.load()
        this.error = null
        quickRetryCount = 0
        this.clearQuickRetry()
      } catch (err) {
        this.error = this.mapError(err?.message || err || '邮件拉取失败')
        // 网络抖动自愈：30s 后快速重试（最多连续 5 次），不用等完整轮询周期
        this.scheduleQuickRetry()
      } finally {
        autoFetchInFlight = false
      }
    },

    scheduleQuickRetry() {
      if (!this.isRunning) return
      this.clearQuickRetry()
      if (quickRetryCount >= QUICK_RETRY_MAX) return
      quickRetryCount++
      quickRetryTimer = window.setTimeout(() => {
        quickRetryTimer = null
        if (this.isRunning) this.fetch()
      }, QUICK_RETRY_DELAY_MS)
    },

    clearQuickRetry() {
      if (quickRetryTimer) {
        window.clearTimeout(quickRetryTimer)
        quickRetryTimer = null
      }
    },

    async doctor(config) {
      this.doctorRunning = true
      try {
        this.doctorResult = await window.api.mail.doctor(config)
        return this.doctorResult
      } catch (err) {
        this.doctorResult = { ok: false, error: err?.message || String(err || '诊断失败') }
        return this.doctorResult
      } finally {
        this.doctorRunning = false
      }
    },

    // 诊断后修复：reconnect=重连 Exchange；restart=重启服务进程
    async fix(action) {
      try {
        const result = await window.api.mail.fix(action)
        if (result?.ok) {
          const status = await window.api.mail.status()
          this.connected = status?.connected || false
          this.isRunning = status?.running || false
          this.configured = status?.running || false
          this.error = null
        }
        return result
      } catch (err) {
        return { ok: false, error: err?.message || String(err || '修复失败') }
      }
    },

    async startAutoFetch() {
      if (this._startingAutoFetch) return
      this._startingAutoFetch = true
      try {
        this.stopAutoFetch()
        const settings = await window.api?.settings?.get?.()
        if (autoFetchTimer) {
          window.clearInterval(autoFetchTimer)
          autoFetchTimer = null
        }
        mailIntervalMinutes = normalizeMailInterval(settings?.mailInterval)

        if (!this.isRunning) return

        autoFetchTimer = window.setInterval(() => {
          if (this.isRunning) this.fetch()
        }, mailIntervalMinutes * 60 * 1000)
      } finally {
        this._startingAutoFetch = false
      }
    },

    stopAutoFetch() {
      if (autoFetchTimer) {
        window.clearInterval(autoFetchTimer)
        autoFetchTimer = null
      }
      this.clearQuickRetry()
    },

    async openDetail(id) {
      // 先展示列表里的数据（标题/发件人/预览），弹层零等待出现
      const listItem = this.mails.find(m => m.id === id)
      this.selectedMail = listItem ? { ...listItem, loading: true } : { id, loading: true }
      this._ensureDetailListener()
      try {
        // 主进程秒回 SQLite 缓存；无缓存保持列表项占位，后台刷新经 onDetailUpdated 自动更新
        const cached = await window.api.mail.detail(id)
        if (cached && this.selectedMail?.id === id) {
          this.selectedMail = cached
          const item = this.mails.find(m => m.id === id)
          if (item && !item.is_read) item.is_read = 1
        }
      } catch (err) {
        console.error('[mail] openDetail failed:', err?.message || err)
      }
    },

    // 后台刷新的详情到位后更新当前打开的弹层（只注册一次）
    _ensureDetailListener() {
      if (this._detailUnsub || !window.api.mail.onDetailUpdated) return
      this._detailUnsub = window.api.mail.onDetailUpdated((detail) => {
        if (this.selectedMail?.id === detail?.id) {
          this.selectedMail = detail
          const item = this.mails.find(m => m.id === detail.id)
          if (item && !item.is_read) item.is_read = 1
        }
      })
    },

    closeDetail() {
      this.selectedMail = null
    },

    async stop() {
      try {
        this.stopAutoFetch()
        await window.api.mail.stop()
      } catch (err) {
        console.error('[mail] stop failed:', err?.message || err)
      } finally {
        this.isRunning = false
        this.connected = false
        this.configured = false
      }
    }
  }
})
