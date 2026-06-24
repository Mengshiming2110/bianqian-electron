import { defineStore } from 'pinia'

const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const DEFAULT_MAIL_DOMAIN = 'LSTECH'
const DEFAULT_MAIL_INTERVAL_MINUTES = 5

let autoFetchTimer = null
let autoFetchInFlight = false

function normalizeMailInterval(value) {
  const minutes = Number(value)
  return [1, 5, 15, 30].includes(minutes) ? minutes : DEFAULT_MAIL_INTERVAL_MINUTES
}

export const useMailStore = defineStore('mail', {
  state: () => ({
    mails: [],
    selectedMail: null,
    isRunning: false,
    configured: false,
    config: null,
    error: null,
    doctorResult: null,
    doctorRunning: false,
    lastSync: null,
    unreadCount: 0,
    mailInterval: DEFAULT_MAIL_INTERVAL_MINUTES
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
      this.config = payload
      this.error = null
      try {
        const result = await window.api.mail.configure(payload)
        if (result?.ok) {
          this.configured = true
          this.isRunning = true
          await this.fetch()
          await this.startAutoFetch()
        } else {
          this.configured = false
          this.isRunning = false
          this.stopAutoFetch()
          this.error = this.mapError(result?.error || '连接失败')
        }
        return result
      } catch (err) {
        this.configured = false
        this.isRunning = false
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
        this.configured = this.isRunning
        this.unreadCount = this.mails.filter(m => !m.is_read).length
        if (this.isRunning) {
          await this.startAutoFetch()
        } else {
          this.stopAutoFetch()
        }
      } catch (err) {
        this.error = this.mapError(err?.message || err || '邮件状态读取失败')
        this.isRunning = false
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
        this.lastSync = new Date().toISOString()
      } catch (err) {
        this.error = this.mapError(err?.message || err || '邮件拉取失败')
      } finally {
        autoFetchInFlight = false
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

    async startAutoFetch() {
      this.stopAutoFetch()
      const settings = await window.api?.settings?.get?.()
      this.mailInterval = normalizeMailInterval(settings?.mailInterval)

      if (!this.isRunning) return

      autoFetchTimer = window.setInterval(() => {
        if (this.isRunning) this.fetch()
      }, this.mailInterval * 60 * 1000)
    },

    stopAutoFetch() {
      if (autoFetchTimer) {
        window.clearInterval(autoFetchTimer)
        autoFetchTimer = null
      }
    },

    async openDetail(id) {
      this.selectedMail = await window.api.mail.detail(id)
      if (this.selectedMail) {
        // mark as read
        const item = this.mails.find(m => m.id === id)
        if (item) { item.is_read = 1; this.unreadCount = Math.max(0, this.unreadCount - 1) }
      }
    },

    closeDetail() {
      this.selectedMail = null
    },

    async stop() {
      this.stopAutoFetch()
      await window.api.mail.stop()
      this.isRunning = false
      this.configured = false
    }
  }
})
