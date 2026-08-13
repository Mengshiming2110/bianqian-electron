import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { app } from 'electron'

const RETRY_MAX = 3
const RETRY_DELAYS_MS = [3000, 15000, 60000]
const SERVICE_READY_TIMEOUT_MS = 20000
const SERVICE_POLL_INTERVAL_MS = 300
const MAIL_REQUEST_TIMEOUT_MS = 30000
const HEALTH_CHECK_INTERVAL_MS = 30000
const HEALTH_FAIL_LIMIT = 3
const FETCH_FAIL_LIMIT = 2
const RESTART_COOLDOWN_MS = 60 * 1000
const MAIL_LOG_MAX_BYTES = 512 * 1024

/**
 * Zcode / 外部自动化操作邮件服务的入口：
 * - 状态文件：app.getPath('userData')/mail-service.json，含 port + token + 运行状态
 * - 读取状态文件后，用 X-Mail-Token 头直接调用服务 HTTP API：
 *   GET  /health            服务健康状态
 *   GET  /doctor            完整诊断（依赖/DNS/TCP/EWS 认证 + fixes 修复建议）
 *   GET  /mails?since=&limit=  邮件列表
 *   GET  /mail/{id}         邮件详情
 *   GET  /mail/{id}/attachments          附件列表
 *   GET  /mail/{id}/attachments/{name}   下载附件
 *   POST /start             body=完整配置，配置并连接（重连 = 用原配置再 POST）
 *   POST /stop              停止服务
 * - 也可通过 window.api.mail.*（IPC）或 mail:fix 触发修复
 */
const MAIL_STATUS_FILE = () => join(app.getPath('userData'), 'mail-service.json')
const MAIL_LOG_FILE = () => join(app.getPath('userData'), 'mail-service.log')

export class MailBridge {
  constructor() {
    this.process = null
    this.baseUrl = ''
    this.token = ''
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
    this.fetchFailStreak = 0
    this.lastRestartAt = 0
  }

  /** 追加日志到 userData/mail-service.log（打包后控制台不可见，靠文件留痕排障） */
  _logFile(msg) {
    try {
      const line = `[${new Date().toISOString()}] ${msg}\n`
      const existing = existsSync(MAIL_LOG_FILE()) ? readFileSync(MAIL_LOG_FILE(), 'utf8') : ''
      const next = existing + line
      writeFileSync(MAIL_LOG_FILE(), next.length > MAIL_LOG_MAX_BYTES ? next.slice(next.length - MAIL_LOG_MAX_BYTES) : next, 'utf8')
    } catch {
      /* 日志失败不影响主流程 */
    }
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
      this.token = randomBytes(16).toString('hex')

      this.process = spawn(exePath, [port], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          MAIL_SERVICE_TOKEN: this.token,
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
        const text = data.toString().trim()
        console.log('[mail-bridge]', text)
        this._logFile(`[service:out] ${text}`)
      })
      this.process.stderr.on('data', (data) => {
        const text = data.toString().trim()
        console.warn('[mail-bridge] stderr:', text)
        this._logFile(`[service:err] ${text}`)
      })
      this.process.on('exit', (code) => {
        console.warn('[mail-bridge] 进程退出, code:', code)
        this._logFile(`进程退出, code=${code}`)
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
      this.fetchFailStreak = 0
      this._logFile(`服务启动成功, port=${port}, configured=${shouldConfigure}`)
      this._writeStatus()
      return true
    } catch (err) {
      console.error('[mail-bridge] 启动失败:', err.message)
      this._logFile(`服务启动失败: ${err.message}`)
      throw err
    }
  }

  /** 状态文件：Zcode/外部工具发现服务端口与令牌的唯一入口 */
  _writeStatus() {
    try {
      const running = this.process != null && !this.stopping
      writeFileSync(MAIL_STATUS_FILE(), JSON.stringify({
        port: Number(this.baseUrl.replace('http://127.0.0.1:', '')) || null,
        token: this.token,
        pid: running ? this.process?.pid : null,
        running,
        connected: running && this.connected,
        fetchFailStreak: this.fetchFailStreak,
        lastError: this.lastError,
        updatedAt: new Date().toISOString(),
        endpoints: {
          'GET /health': '服务健康状态',
          'GET /doctor': '完整诊断（依赖/DNS/TCP/EWS 认证 + 修复建议）',
          'GET /mails?since=&limit=': '邮件列表',
          'GET /mail/{id}': '邮件详情',
          'GET /mail/{id}/attachments': '附件列表',
          'GET /mail/{id}/attachments/{name}': '下载附件',
          'POST /start': '配置并连接（body 为完整配置；重连 = 用原配置再 POST）',
          'POST /stop': '停止服务'
        }
      }, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[mail-bridge] 状态文件写入失败:', err.message)
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

    // 连续多次不健康：服务自愈 —— 杀掉进程重新拉起（会重新发送配置并连接 Exchange）。
    // 拉取失败看门狗：/health 报连接正常但 /mails 连续失败时（连接对象已死但未上报），同样触发重启，
    // 补上「假绿灯」盲区。两次触发之间保留冷却，避免服务器故障时热循环重启。
    const fetchSick = this.fetchFailStreak >= FETCH_FAIL_LIMIT
    const now = Date.now()
    const cooldownOk = now - this.lastRestartAt >= RESTART_COOLDOWN_MS
    if ((this.unhealthyCount >= HEALTH_FAIL_LIMIT || fetchSick) && cooldownOk) {
      const reason = fetchSick
        ? `连续 ${this.fetchFailStreak} 次拉取失败（连接假绿灯），重启邮件服务`
        : `连续 ${HEALTH_FAIL_LIMIT} 次健康检查失败，重启邮件服务`
      console.warn(`[mail-bridge] ${reason}`)
      this._logFile(reason)
      this.unhealthyCount = 0
      this.fetchFailStreak = 0
      this._restart().catch(() => {})
    }
    this._writeStatus()
  }

  /** 诊断后修复：reconnect=用现有配置重置账号重连（不重启进程）；restart=整进程重启 */
  async fix(action) {
    if (action === 'reconnect') {
      if (!this.process) return { ok: false, error: '邮件服务未运行' }
      try {
        await this._sendConfig()
        this.connected = true
        this.lastError = ''
        this.unhealthyCount = 0
        this._writeStatus()
        return { ok: true }
      } catch (err) {
        console.error('[mail-bridge] 重连失败:', err.message)
        return { ok: false, error: err.message }
      }
    }
    if (action === 'restart') {
      if (!this.process) return { ok: false, error: '邮件服务未运行' }
      try {
        await this._restart()
        return { ok: true }
      } catch (err) {
        console.error('[mail-bridge] 重启失败:', err.message)
        return { ok: false, error: err.message }
      }
    }
    return { ok: false, error: `未知修复动作: ${action}` }
  }

  _restart() {
    if (this.stopping || this.restarting) return Promise.reject(new Error('服务正在重启或停止中'))
    this.restarting = true
    this.lastRestartAt = Date.now()
    this._logFile('手动/自动重启邮件服务')
    this._killProcess()
    return this.start(this.config)
      .then(() => {
        this.restarting = false
        console.log('[mail-bridge] 重启成功')
        return { ok: true }
      })
      .catch((err) => {
        this.restarting = false
        console.error('[mail-bridge] 重启失败:', err.message)
        this._retry()
        throw err
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
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { 'X-Mail-Token': this.token } : {}),
          ...fetchOptions.headers
        }
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
      const result = await this._fetch(url, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
      this.fetchFailStreak = 0
      return result
    } catch (err) {
      // 瞬时网络抖动：800ms 后重试一次再判定失败
      await new Promise((resolve) => setTimeout(resolve, 800))
      try {
        const result = await this._fetch(url, { timeoutMs: MAIL_REQUEST_TIMEOUT_MS })
        this.fetchFailStreak = 0
        return result
      } catch (err2) {
        this.fetchFailStreak++
        this._logFile(`拉取邮件失败(连续第 ${this.fetchFailStreak} 次): ${err2.message}`)
        if (options.throwOnError) throw err2
        return []
      }
    }
  }

  async fetchMailDetail(id) {
    try {
      // 详情走缓存兜底 + 后台刷新，网络等待上限收紧到 8s，避免 EWS 慢时拖住界面
      return await this._fetch(`/mail/${id}`, { timeoutMs: 8000 })
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
    // 诊断含 EWS 认证测试（quick 模式 ~10s 有界），超时放宽到 20s
    return await this._fetch('/doctor', { timeoutMs: 20000 })
  }

  getStatus() {
    const running = this.process != null && !this.stopping
    return {
      running,
      connected: running && this.connected,
      error: running ? this.lastError : '邮件服务未启动'
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
    this._writeStatus()
  }
}
