import { defineStore } from 'pinia'

export const useMailStore = defineStore('mail', {
  state: () => ({
    mails: [],
    selectedMail: null,
    isRunning: false,
    configured: false,
    config: null,
    error: null,
    lastSync: null,
    unreadCount: 0
  }),

  actions: {
    async configure(config) {
      this.config = config
      this.error = null
      const result = await window.api.mail.configure(config)
      if (result?.ok) {
        this.configured = true
        this.isRunning = true
        await this.fetch()
      } else {
        this.error = this.mapError(result?.error || '连接失败')
      }
      return result
    },

    mapError(raw) {
      if (!raw) return '连接失败，请检查网络'
      const msg = String(raw).toLowerCase()
      if (msg.includes('password') || msg.includes('auth') || msg.includes('401') || msg.includes('403'))
        return '密码错误或账号被锁定，请重新输入密码'
      if (msg.includes('dns') || msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('enotfound'))
        return '无法连接到服务器，请确认已连接公司网络'
      if (msg.includes('not found') || msg.includes('404'))
        return '服务器地址不正确，请检查 Exchange 地址'
      return `连接失败：${raw}`
    },

    async load() {
      this.mails = await window.api.mail.list() || []
      const status = await window.api.mail.status()
      this.isRunning = status?.running || false
      this.configured = this.isRunning
      this.unreadCount = this.mails.filter(m => !m.is_read).length
    },

    async fetch() {
      await window.api.mail.fetch()
      await this.load()
      this.lastSync = new Date().toISOString()
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
      await window.api.mail.stop()
      this.isRunning = false
      this.configured = false
    }
  }
})
