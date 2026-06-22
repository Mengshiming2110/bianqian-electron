import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const RETRY_MAX = 3
const SERVICE_READY_TIMEOUT_MS = 20000
const SERVICE_POLL_INTERVAL_MS = 300
const MAIL_REQUEST_TIMEOUT_MS = 30000

export class MailBridge {
  constructor() {
    this.process = null
    this.baseUrl = ''
    this.retryCount = 0
    this.healthTimer = null
    this.config = null
    this.stopping = false
  }

  async start(config, options = {}) {
    const shouldConfigure = options.configure !== false
    this.config = config
    this.stopping = false
    const exeCandidates = app.isPackaged
      ? [
          join(process.resourcesPath, 'MailService.exe'),
          join(app.getAppPath(), 'resources', 'MailService.exe')
        ]
      : [join(app.getAppPath(), 'resources', 'MailService.exe')]
    const exePath = exeCandidates.find((candidate) => existsSync(candidate))

    if (!exePath) {
      throw new Error(`邮件服务不存在: ${exeCandidates.join(' 或 ')}`)
    }

    try {
      const port = String(9800 + Math.floor(Math.random() * 200))
      this.baseUrl = `http://127.0.0.1:${port}`

      this.process = spawn(exePath, [port], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          MAIL_SERVER: config.server || '',
          MAIL_SMTP: config.email || '',
          MAIL_EMAIL: config.email || '',
          MAIL_DOMAIN: config.domain || '',
          MAIL_DOMAIN_USER: config.domainUser || config.username || '',
          MAIL_USERNAME: config.username || config.domainUser || '',
          MAIL_PASS: config.password || '',
          MAIL_PASSWORD: config.password || ''
        }
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
        if (!this.stopping && code !== 0) this._retry()
      })

      this.healthTimer = setInterval(() => this._healthCheck(), 30000)

      console.log('[mail-bridge] 启动, port:', port)
      await this._waitUntilReady()
      if (shouldConfigure) {
        return await this._sendConfig()
      }
      return true
    } catch (err) {
      console.error('[mail-bridge] 启动失败:', err.message)
      throw err
    }
  }

  async _sendConfig() {
    if (!this.config) return
    try {
      await this._fetch('/start', {
        method: 'POST',
        body: JSON.stringify(this.config),
        timeoutMs: MAIL_REQUEST_TIMEOUT_MS
      })
    } catch (err) {
      console.error('[mail-bridge] 配置发送失败:', err.message)
      throw err
    }
  }

  async _healthCheck() {
    try {
      await this._fetch('/health', { timeoutMs: 5000 })
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

  async _waitUntilReady() {
    const startedAt = Date.now()
    let lastError = null

    while (Date.now() - startedAt < SERVICE_READY_TIMEOUT_MS) {
      if (!this.process) {
        throw new Error('邮件服务启动失败，进程已退出')
      }

      try {
        await this._fetch('/health', { timeoutMs: 2000 })
        return
      } catch (err) {
        lastError = err
        await new Promise((resolve) => setTimeout(resolve, SERVICE_POLL_INTERVAL_MS))
      }
    }

    throw new Error(`邮件服务启动超时: ${lastError?.message || '未响应'}`)
  }

  async _fetch(path, options = {}) {
    const url = this.baseUrl + path
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs || MAIL_REQUEST_TIMEOUT_MS
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...fetchOptions.headers }
      })
      const text = await res.text()
      let payload = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {}
      if (!res.ok) {
        throw new Error(payload?.error || text || `HTTP ${res.status}`)
      }
      return payload
    } finally {
      clearTimeout(timeout)
    }
  }

  async fetchMails(since, options = {}) {
    try {
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      return await this._fetch(`/mails${params}`, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
    } catch (err) {
      if (options.throwOnError) throw err
      return []
    }
  }

  async fetchMailDetail(id) {
    try {
      return await this._fetch(`/mail/${id}`, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
    } catch {
      return null
    }
  }

  async doctor() {
    return await this._fetch('/doctor', { timeoutMs: 5000 })
  }

  stop() {
    this.stopping = true
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.process) {
      try {
        this._fetch('/stop', { method: 'POST', timeoutMs: 3000 }).catch(() => {})
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
