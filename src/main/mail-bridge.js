import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'

const RETRY_MAX = 3

export class MailBridge {
  constructor() {
    this.process = null
    this.baseUrl = ''
    this.retryCount = 0
    this.healthTimer = null
    this.config = null
  }

  start(config) {
    this.config = config
    const exePath = app.isPackaged
      ? join(process.resourcesPath, 'MailService.exe')
      : join(app.getAppPath(), 'resources', 'MailService.exe')

    try {
      const port = String(9800 + Math.floor(Math.random() * 200))
      this.baseUrl = `http://127.0.0.1:${port}`

      this.process = spawn(exePath, [port], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.process.stdout.on('data', (data) => {
        console.log('[mail-bridge]', data.toString().trim())
      })
      this.process.stderr.on('data', (data) => {
        console.warn('[mail-bridge] stderr:', data.toString().trim())
      })
      this.process.on('exit', (code) => {
        console.warn('[mail-bridge] 进程退出, code:', code)
        this.process = null
        if (code !== 0) this._retry()
      })

      setTimeout(() => this._sendConfig(), 1000)

      this.healthTimer = setInterval(() => this._healthCheck(), 30000)

      console.log('[mail-bridge] 启动, port:', port)
    } catch (err) {
      console.error('[mail-bridge] 启动失败:', err.message)
    }
  }

  async _sendConfig() {
    if (!this.config) return
    try {
      await this._fetch('/start', {
        method: 'POST',
        body: JSON.stringify(this.config)
      })
    } catch (err) {
      console.error('[mail-bridge] 配置发送失败:', err.message)
    }
  }

  async _healthCheck() {
    try {
      await this._fetch('/health')
      this.retryCount = 0
    } catch {
      console.warn('[mail-bridge] 健康检查失败')
    }
  }

  _retry() {
    if (this.retryCount >= RETRY_MAX) {
      console.error('[mail-bridge] 已达最大重试次数')
      return
    }
    this.retryCount++
    setTimeout(() => this.start(this.config), 3000)
  }

  async _fetch(path, options = {}) {
    const url = this.baseUrl + path
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  async fetchMails(since) {
    try {
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      return await this._fetch(`/mails${params}`)
    } catch {
      return []
    }
  }

  async fetchMailDetail(id) {
    try {
      return await this._fetch(`/mail/${id}`)
    } catch {
      return null
    }
  }

  stop() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.process) {
      try {
        this._fetch('/stop', { method: 'POST' }).catch(() => {})
        setTimeout(() => {
          if (this.process) { this.process.kill(); this.process = null }
        }, 2000)
      } catch {
        this.process.kill()
        this.process = null
      }
    }
  }
}
