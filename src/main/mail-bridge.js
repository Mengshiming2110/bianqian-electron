import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const RETRY_MAX = 3
const RETRY_DELAYS_MS = [3000, 15000, 60000]
const SERVICE_READY_TIMEOUT_MS = 20000
const SERVICE_POLL_INTERVAL_MS = 300
const MAIL_REQUEST_TIMEOUT_MS = 30000
const HEALTH_CHECK_INTERVAL_MS = 30000
const HEALTH_FAIL_LIMIT = 3

export class MailBridge {
  constructor() {
    this.process = null
    this.baseUrl = ''
    this.retryCount = 0
    this.healthTimer = null
    this.retryTimer = null
    this.killTimer = null
    this.config = null
    this.stopping = false
    this.restarting = false
    this.unhealthyCount = 0
    this.connected = false
    this.lastError = ''
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
        this.connected = false
        // restarting/stopping 期间主动 kill 不触发重试，避免双重重启
        if (!this.stopping && !this.restarting && code !== 0) this._retry()
      })

      if (this.healthTimer) clearInterval(this.healthTimer)
      this.healthTimer = setInterval(() => this._healthCheck(), HEALTH_CHECK_INTERVAL_MS)

      console.log('[mail-bridge] 启动, port:', port)
      await this._waitUntilReady()
      if (shouldConfigure) {
        await this._sendConfig()
        this.connected = true
        this.lastError = ''
      }
      this.unhealthyCount = 0
      return true
    } catch (err) {
      console.error('[mail-bridge] 启动失败:', err.message)
      throw err
    }
  }

  async _sendConfig() {
    if (!this.config) return false
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
    if (this.stopping) return
    try {
      const res = await this._fetch('/health', { timeoutMs: 5000 })
      const healthy = res && res.connected !== false
      if (healthy) {
        this.unhealthyCount = 0
        this.connected = true
        this.lastError = ''
        this.retryCount = 0
      } else {
        this.connected = false
        this.lastError = res?.error || '邮件服务未连接 Exchange'
        this.unhealthyCount++
      }
    } catch {
      this.connected = false
      this.lastError = '邮件服务无响应'
      this.unhealthyCount++
    }

    // 连续多次不健康：服务自愈 —— 杀掉进程重新拉起（会重新发送配置并连接 Exchange）
    if (this.unhealthyCount >= HEALTH_FAIL_LIMIT) {
      console.warn(`[mail-bridge] 连续 ${HEALTH_FAIL_LIMIT} 次健康检查失败，重启邮件服务`)
      this.unhealthyCount = 0
      this._restart()
    }
  }

  _restart() {
    if (this.stopping || this.restarting) return
    this.restarting = true
    this._killProcess()
    this.start(this.config)
      .then(() => {
        this.restarting = false
        console.log('[mail-bridge] 重启成功')
      })
      .catch((err) => {
        this.restarting = false
        console.error('[mail-bridge] 重启失败:', err.message)
        this._retry()
      })
  }

  _killProcess() {
    if (!this.process) return
    try {
      this._fetch('/stop', { method: 'POST', timeoutMs: 3000 }).catch(() => {})
      this.killTimer = setTimeout(() => {
        if (this.process) { this.process.kill(); this.process = null }
        this.killTimer = null
      }, 2000)
    } catch {
      this.process.kill()
      this.process = null
    }
  }

  _retry() {
    if (this.retryCount >= RETRY_MAX) {
      // 本轮放弃，等下次健康检查再触发重启周期，避免长时间断网时热循环
      console.error('[mail-bridge] 本轮重启已达上限，等待下轮')
      this.retryCount = 0
      return
    }
    this.retryCount++
    const delay = RETRY_DELAYS_MS[Math.min(this.retryCount - 1, RETRY_DELAYS_MS.length - 1)]
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.start(this.config)
        .then(() => {
          this.retryCount = 0
          console.log('[mail-bridge] 重启成功')
        })
        .catch((err) => console.error('[mail-bridge] 重启失败:', err.message))
    }, delay)
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
    const { timeoutMs: _timeoutMs, responseType: _responseType, ...fetchOptions } = options

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...fetchOptions.headers }
      })
      if (options.responseType === 'arraybuffer') {
        const buf = await res.arrayBuffer()
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return { buffer: Buffer.from(buf), status: res.status }
      }
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
    const url = `/mails${since ? `?since=${encodeURIComponent(since)}` : ''}`
    try {
      return await this._fetch(url, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
    } catch (err) {
      // 瞬时网络抖动：800ms 后重试一次再判定失败
      await new Promise((resolve) => setTimeout(resolve, 800))
      try {
        return await this._fetch(url, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
      } catch (err2) {
        if (options.throwOnError) throw err2
        return []
      }
    }
  }

  async fetchMailDetail(id) {
    try {
      return await this._fetch(`/mail/${id}`, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
    } catch {
      return null
    }
  }

  async listAttachments(mailId) {
    try {
      return await this._fetch(`/mail/${mailId}/attachments`, { timeoutMs: 10000 })
    } catch {
      return []
    }
  }

  async downloadAttachment(mailId, filename) {
    try {
      const res = await this._fetch(`/mail/${mailId}/attachments/${encodeURIComponent(filename)}`, {
        timeoutMs: 30000,
        responseType: 'arraybuffer'
      })
      return { buffer: res.buffer, filename }
    } catch {
      return null
    }
  }

  async doctor() {
    return await this._fetch('/doctor', { timeoutMs: 5000 })
  }

  getStatus() {
    return {
      running: this.process != null,
      connected: this.process != null && this.connected,
      error: this.process ? this.lastError : '邮件服务未启动'
    }
  }

  stop() {
    this.stopping = true
    this.connected = false
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.killTimer) {
      clearTimeout(this.killTimer)
      this.killTimer = null
    }
    if (this.process) {
      this._killProcess()
    }
  }
}
