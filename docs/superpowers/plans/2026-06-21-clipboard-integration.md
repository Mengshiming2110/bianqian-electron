# 便签+剪切板+邮件 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Electron 便签应用中集成剪切板历史记录和 Outlook 邮件提取能力，单窗口三 Tab 架构

**Architecture:** 新增 clipboard-monitor（剪切板轮询）+ database.js（SQLite）+ mail-bridge（.NET 子进程管理）。渲染进程新增两个 Pinia store 和两个 Vue 面板组件。App.vue 底部加 Tab 栏切换三个面板。

**Tech Stack:** Electron 28 + Vue 3 + Pinia + better-sqlite3 + lucide-vue-next + electron-store（已有）

---

## 文件映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 改 | 添加 better-sqlite3 |
| `src/main/database.js` | 新 | SQLite 初始化 + 建表 |
| `src/main/clipboard-monitor.js` | 新 | 剪切板 500ms 轮询 |
| `src/main/mail-bridge.js` | 新 | MailService.exe 子进程管理 |
| `src/main/ipc-clipboard.js` | 新 | 剪切板 IPC handler |
| `src/main/ipc-mail.js` | 新 | 邮件 IPC handler |
| `src/main/index.js` | 改 | 启动监听 + 桥接 |
| `src/preload/index.js` | 改 | 新增 clipboard/mail bridge |
| `src/renderer/src/stores/clipboard.js` | 新 | 剪切板 Pinia store |
| `src/renderer/src/stores/mail.js` | 新 | 邮件 Pinia store |
| `src/renderer/src/components/ClipboardPanel.vue` | 新 | 剪切板面板 |
| `src/renderer/src/components/MailPanel.vue` | 新 | 邮件面板 |
| `src/renderer/src/App.vue` | 改 | 添加 Tab 栏 + 面板切换 |
| `src/renderer/src/assets/styles/global.css` | 改 | 新增 Tab/剪切板/邮件样式 |

---

### Task 1: 安装 better-sqlite3

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm install better-sqlite3
```

Expected: 安装成功，`package.json` 自动添加 `"better-sqlite3"` 到 dependencies。

- [ ] **Step 2: 验证安装**

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)'); db.exec('INSERT INTO test VALUES (1)'); console.log(db.prepare('SELECT * FROM test').get()); db.close(); console.log('better-sqlite3 OK')"
```

Expected: `{ id: 1 }` + `better-sqlite3 OK`

- [ ] **Step 3: Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3"
```

---

### Task 2: SQLite 数据库初始化

**Files:**
- Create: `src/main/database.js`

- [ ] **Step 1: 创建 database.js**

`src/main/database.js`:

```javascript
/**
 * SQLite 数据库 — 剪切板历史 + 邮件存储
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

let db = null

export function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'clipboard.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      preview TEXT,
      source_app TEXT DEFAULT '',
      hash TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      copy_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_copied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clipboard_hash
      ON clipboard_items(hash);
    CREATE INDEX IF NOT EXISTS idx_clipboard_created
      ON clipboard_items(created_at DESC);

    CREATE TABLE IF NOT EXISTS mail_items (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      body TEXT DEFAULT '',
      received_at TEXT NOT NULL DEFAULT '',
      is_read INTEGER DEFAULT 0,
      extracted_fields TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_mail_received
      ON mail_items(received_at DESC);
  `)
}

export function getDatabase() {
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
```

- [ ] **Step 2: 构建验证**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 构建成功，无报错。

- [ ] **Step 3: Commit**

```bash
git add src/main/database.js
git commit -m "feat: SQLite database init with clipboard_items + mail_items tables"
```

---

### Task 3: 剪切板监听器

**Files:**
- Create: `src/main/clipboard-monitor.js`

- [ ] **Step 1: 创建 clipboard-monitor.js**

`src/main/clipboard-monitor.js`:

```javascript
/**
 * 剪切板监听器 — 每 500ms 轮询，hash 去重
 */
import { clipboard } from 'electron'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { getDatabase } from './database'

let pollTimer = null
let lastHash = ''
const MAX_ITEMS = 500

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function guessSourceApp() {
  // Electron 不直接提供来源窗口，留空
  return ''
}

function readClipboard() {
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    const dataUrl = img.toDataURL()
    const h = hashContent(dataUrl)
    if (h === lastHash) return null
    return { type: 'image', content: dataUrl, hash: h }
  }

  const html = clipboard.readHTML()
  if (html && html.trim()) {
    const h = hashContent(html)
    if (h === lastHash) return null
    const text = html.replace(/<[^>]+>/g, '').trim().slice(0, 200)
    return { type: 'html', content: html, preview: text, hash: h }
  }

  const text = clipboard.readText()
  if (text && text.trim()) {
    const h = hashContent(text)
    if (h === lastHash) return null
    return { type: 'text', content: text, preview: text.slice(0, 200), hash: h }
  }

  return null
}

function saveItem(item) {
  const db = getDatabase()
  const now = new Date().toISOString()

  // 已有同 hash 的项 → 更新 copy_count + last_copied_at
  const existing = db.prepare('SELECT id, copy_count FROM clipboard_items WHERE hash = ?').get(item.hash)
  if (existing) {
    db.prepare('UPDATE clipboard_items SET copy_count = ?, last_copied_at = ? WHERE id = ?')
      .run(existing.copy_count + 1, now, existing.id)
    return existing.id
  }

  // 新项
  const id = randomUUID()
  db.prepare(`
    INSERT INTO clipboard_items (id, type, content, preview, source_app, hash, created_at, last_copied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, item.type, item.content || '', item.preview || '', guessSourceApp(), item.hash, now, now)

  // 超过上限时清理旧的非固定项
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM clipboard_items').get().cnt
  if (count > MAX_ITEMS) {
    const excess = count - MAX_ITEMS
    db.prepare('DELETE FROM clipboard_items WHERE pinned = 0 AND id IN (SELECT id FROM clipboard_items WHERE pinned = 0 ORDER BY last_copied_at ASC LIMIT ?)').run(excess)
  }

  return id
}

function getItemById(id) {
  const db = getDatabase()
  return db.prepare('SELECT * FROM clipboard_items WHERE id = ?').get(id) || null
}

export function startClipboardMonitor(onNewItem) {
  if (pollTimer) return

  pollTimer = setInterval(() => {
    try {
      const item = readClipboard()
      if (!item) return
      lastHash = item.hash
      const id = saveItem(item)
      if (id && onNewItem) {
        const full = getItemById(id)
        if (full) onNewItem(full)
      }
    } catch (err) {
      console.error('[clipboard-monitor] error:', err.message)
    }
  }, 500)
}

export function stopClipboardMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 将内容写回系统剪切板 */
export function writeToClipboard(id) {
  const db = getDatabase()
  const item = db.prepare('SELECT * FROM clipboard_items WHERE id = ?').get(id)
  if (!item) return false
  if (item.type === 'image') {
    const { nativeImage } = require('electron')
    clipboard.writeImage(nativeImage.createFromDataURL(item.content))
  } else {
    clipboard.writeText(item.content || '')
  }
  // 更新 last_copied_at
  db.prepare('UPDATE clipboard_items SET last_copied_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  return true
}
```

- [ ] **Step 2: 构建验证**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/main/clipboard-monitor.js
git commit -m "feat: clipboard monitor with 500ms polling and hash dedup"
```

---

### Task 4: 剪切板 IPC Handler

**Files:**
- Create: `src/main/ipc-clipboard.js`

- [ ] **Step 1: 创建 ipc-clipboard.js**

`src/main/ipc-clipboard.js`:

```javascript
/**
 * 剪切板 IPC 处理器
 */
import { ipcMain } from 'electron'
import { getDatabase } from './database'
import { writeToClipboard } from './clipboard-monitor'

export function setupClipboardHandlers() {
  ipcMain.handle('clipboard:list', (_, limit = 50, offset = 0) => {
    try {
      const db = getDatabase()
      return db.prepare('SELECT * FROM clipboard_items ORDER BY pinned DESC, last_copied_at DESC LIMIT ? OFFSET ?').all(limit, offset)
    } catch (err) {
      console.error('[ipc] clipboard:list 失败:', err.message)
      return []
    }
  })

  ipcMain.handle('clipboard:search', (_, query) => {
    try {
      const db = getDatabase()
      const q = `%${query}%`
      return db.prepare('SELECT * FROM clipboard_items WHERE content LIKE ? OR preview LIKE ? ORDER BY pinned DESC, last_copied_at DESC LIMIT 100').all(q, q)
    } catch (err) {
      console.error('[ipc] clipboard:search 失败:', err.message)
      return []
    }
  })

  ipcMain.handle('clipboard:delete', (_, id) => {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM clipboard_items WHERE id = ?').run(id)
      return true
    } catch (err) {
      console.error('[ipc] clipboard:delete 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:togglePin', (_, id) => {
    try {
      const db = getDatabase()
      const item = db.prepare('SELECT pinned FROM clipboard_items WHERE id = ?').get(id)
      if (!item) return false
      db.prepare('UPDATE clipboard_items SET pinned = ? WHERE id = ?').run(item.pinned ? 0 : 1, id)
      return true
    } catch (err) {
      console.error('[ipc] clipboard:togglePin 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:clearAll', () => {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM clipboard_items WHERE pinned = 0').run()
      return true
    } catch (err) {
      console.error('[ipc] clipboard:clearAll 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:paste', (_, id) => {
    try {
      return writeToClipboard(id)
    } catch (err) {
      console.error('[ipc] clipboard:paste 失败:', err.message)
      return false
    }
  })

  ipcMain.handle('clipboard:stats', () => {
    try {
      const db = getDatabase()
      return db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN pinned = 1 THEN 1 ELSE 0 END) AS pinned FROM clipboard_items').get()
    } catch (err) {
      console.error('[ipc] clipboard:stats 失败:', err.message)
      return { total: 0, pinned: 0 }
    }
  })
}
```

- [ ] **Step 2: 构建验证**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-clipboard.js
git commit -m "feat: clipboard IPC handlers (list/search/delete/pin/clear/paste/stats)"
```

---

### Task 5: 邮件桥接器

**Files:**
- Create: `src/main/mail-bridge.js`

- [ ] **Step 1: 创建 mail-bridge.js**

`src/main/mail-bridge.js`:

```javascript
/**
 * 邮件桥接器 — 管理 MailService.exe 子进程
 *
 * MailService.exe 是一个 .NET 控制台程序，监听 localhost 随机端口。
 * 启动时 spawn 进程，通过 HTTP JSON 通信。
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'

const HEALTH_CHECK_INTERVAL = 30_000   // 健康检查：每 30s
const RETRY_MAX = 3

export class MailBridge {
  constructor() {
    this.process = null
    this.baseUrl = ''
    this.retryCount = 0
    this.healthTimer = null
    this.config = null // { server, email, password }
  }

  /** 启动 MailService.exe */
  start(config) {
    this.config = config
    const exePath = app.isPackaged
      ? join(process.resourcesPath, 'MailService.exe')
      : join(app.getAppPath(), 'resources', 'MailService.exe')

    try {
      // 子进程接收端口号作为参数
      const port = String(9800 + Math.floor(Math.random() * 200))
      this.baseUrl = `http://127.0.0.1:${port}`

      this.process = spawn(exePath, [port], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.process.stdout.on('data', (data) => {
        console.log('[mail-bridge] stdout:', data.toString().trim())
      })
      this.process.stderr.on('data', (data) => {
        console.warn('[mail-bridge] stderr:', data.toString().trim())
      })
      this.process.on('exit', (code) => {
        console.warn('[mail-bridge] 进程退出, code:', code)
        this.process = null
        if (code !== 0) this._retry()
      })

      // 等子进程启动后发送配置
      setTimeout(() => this._sendConfig(), 1000)

      // 定期健康检查
      this.healthTimer = setInterval(() => this._healthCheck(), HEALTH_CHECK_INTERVAL)

      console.log('[mail-bridge] 启动 MailService.exe, port:', port)
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
      console.log('[mail-bridge] 配置已发送')
    } catch (err) {
      console.error('[mail-bridge] 发送配置失败:', err.message)
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
    console.log(`[mail-bridge] 第 ${this.retryCount} 次重试...`)
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

  /** 获取新邮件 */
  async fetchMails(since) {
    try {
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      return await this._fetch(`/mails${params}`)
    } catch (err) {
      console.error('[mail-bridge] 获取邮件失败:', err.message)
      return []
    }
  }

  /** 获取单封邮件详情 */
  async fetchMailDetail(id) {
    try {
      return await this._fetch(`/mail/${id}`)
    } catch (err) {
      console.error('[mail-bridge] 获取邮件详情失败:', err.message)
      return null
    }
  }

  /** 停止并关闭子进程 */
  stop() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.process) {
      try {
        this._fetch('/stop', { method: 'POST' }).catch(() => {})
        setTimeout(() => {
          if (this.process) {
            this.process.kill()
            this.process = null
          }
        }, 2000)
      } catch {
        this.process.kill()
        this.process = null
      }
    }
  }
}
```

- [ ] **Step 2: 构建验证**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/main/mail-bridge.js
git commit -m "feat: mail bridge for .NET MailService.exe subprocess"
```

---

### Task 6: 邮件 IPC Handler

**Files:**
- Create: `src/main/ipc-mail.js`

- [ ] **Step 1: 创建 ipc-mail.js**

`src/main/ipc-mail.js`:

```javascript
/**
 * 邮件 IPC 处理器
 */
import { ipcMain } from 'electron'
import { getDatabase } from './database'
import { MailBridge } from './mail-bridge'

let bridge = null

export function setupMailHandlers() {
  // 保存配置 + 启动子进程
  ipcMain.handle('mail:configure', async (_, config) => {
    try {
      if (bridge) bridge.stop()
      bridge = new MailBridge()
      bridge.start(config)
      return { ok: true }
    } catch (err) {
      console.error('[ipc] mail:configure 失败:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // 获取邮件列表
  ipcMain.handle('mail:list', async () => {
    try {
      const db = getDatabase()
      return db.prepare('SELECT * FROM mail_items ORDER BY received_at DESC LIMIT 100').all()
    } catch (err) {
      console.error('[ipc] mail:list 失败:', err.message)
      return []
    }
  })

  // 手动拉取新邮件
  ipcMain.handle('mail:fetch', async () => {
    if (!bridge) return []
    try {
      const mails = await bridge.fetchMails()
      if (!Array.isArray(mails) || !mails.length) return []
      const db = getDatabase()
      const insert = db.prepare(`
        INSERT OR IGNORE INTO mail_items (id, subject, sender, body, received_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const m of mails) {
        insert.run(m.id, m.subject || '', m.sender || '', m.body || '', m.received_at || '')
      }
      return mails
    } catch (err) {
      console.error('[ipc] mail:fetch 失败:', err.message)
      return []
    }
  })

  // 获取单封邮件详情
  ipcMain.handle('mail:detail', async (_, id) => {
    try {
      const db = getDatabase()
      return db.prepare('SELECT * FROM mail_items WHERE id = ?').get(id) || null
    } catch (err) {
      console.error('[ipc] mail:detail 失败:', err.message)
      return null
    }
  })

  // 停止邮件子进程
  ipcMain.handle('mail:stop', () => {
    if (bridge) {
      bridge.stop()
      bridge = null
    }
    return true
  })

  // 检查邮件配置状态
  ipcMain.handle('mail:status', () => {
    return { running: bridge !== null }
  })
}

export function stopMailBridge() {
  if (bridge) {
    bridge.stop()
    bridge = null
  }
}
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/main/ipc-mail.js
git commit -m "feat: mail IPC handlers (configure/list/fetch/detail/stop/status)"
```

---

### Task 7: 主进程入口集成

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: 读取当前 index.js，添加初始化调用**

在 `src/main/index.js` 顶部添加 import：

```javascript
import { initDatabase, closeDatabase } from './database'
import { startClipboardMonitor, stopClipboardMonitor } from './clipboard-monitor'
import { setupClipboardHandlers } from './ipc-clipboard'
import { setupMailHandlers, stopMailBridge } from './ipc-mail'
```

在 `app.whenReady()` 中，`initStore()` 之后添加：

```javascript
// 初始化 SQLite 数据库
initDatabase()

// 注册 IPC handlers
setupClipboardHandlers()
setupMailHandlers()

// 启动剪切板监听
startClipboardMonitor((item) => {
  const win = getCloudWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('clipboard:newItem', item)
  }
})
```

在 `app.on('will-quit')` 中添加清理：

```javascript
stopClipboardMonitor()
stopMailBridge()
closeDatabase()
```

完整修改后的 `index.js` 关键部分：

```javascript
import { app, globalShortcut, dialog } from 'electron'
import { initDatabase, closeDatabase } from './database'
import { startClipboardMonitor, stopClipboardMonitor } from './clipboard-monitor'
import { setupClipboardHandlers } from './ipc-clipboard'
import { setupMailHandlers, stopMailBridge } from './ipc-mail'
// ... 已有 imports ...

app.whenReady().then(async () => {
  initStore()
  initDatabase()

  setupIpcHandlers()
  setupClipboardHandlers()
  setupMailHandlers()

  const win = createCloudWindow()
  bindHoverInteraction()
  bindWindowShortcuts(win)
  setupTray()
  setupShortcuts()

  // 启动剪切板监听，新内容推送给渲染进程
  startClipboardMonitor((item) => {
    const w = getCloudWindow()
    if (w && !w.isDestroyed()) {
      w.webContents.send('clipboard:newItem', item)
    }
  })

  // ... 已有 activate handler ...
})

// ... 已有 window-all-closed ...

app.on('will-quit', () => {
  stopClipboardMonitor()
  stopMailBridge()
  closeDatabase()
  unregisterShortcuts()
  globalShortcut.unregisterAll()
  destroyCloudWindow()
  destroyTray()
})
```

- [ ] **Step 2: 构建验证**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 构建成功，无 import 错误。

- [ ] **Step 3: Commit**

```bash
git add src/main/index.js
git commit -m "feat: integrate clipboard monitor + mail bridge into main process"
```

---

### Task 8: Preload 桥接扩展

**Files:**
- Modify: `src/preload/index.js`

- [ ] **Step 1: 在 `contextBridge.exposeInMainWorld('api', { ... })` 对象中添加两个新命名空间**

在 `notify` 块之后（`}` 闭合前）添加：

```javascript
clipboard: {
  list: (limit, offset) => ipcRenderer.invoke('clipboard:list', limit, offset),
  search: (query) => ipcRenderer.invoke('clipboard:search', query),
  delete: (id) => ipcRenderer.invoke('clipboard:delete', id),
  togglePin: (id) => ipcRenderer.invoke('clipboard:togglePin', id),
  clearAll: () => ipcRenderer.invoke('clipboard:clearAll'),
  paste: (id) => ipcRenderer.invoke('clipboard:paste', id),
  stats: () => ipcRenderer.invoke('clipboard:stats'),
  onNewItem: (callback) => on('clipboard:newItem', callback)
},
mail: {
  configure: (config) => ipcRenderer.invoke('mail:configure', config),
  list: () => ipcRenderer.invoke('mail:list'),
  fetch: () => ipcRenderer.invoke('mail:fetch'),
  detail: (id) => ipcRenderer.invoke('mail:detail', id),
  stop: () => ipcRenderer.invoke('mail:stop'),
  status: () => ipcRenderer.invoke('mail:status')
}
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/preload/index.js
git commit -m "feat: add clipboard + mail bridge to preload"
```

---

### Task 9: 剪切板 Pinia Store

**Files:**
- Create: `src/renderer/src/stores/clipboard.js`

- [ ] **Step 1: 创建 stores/clipboard.js**

`src/renderer/src/stores/clipboard.js`:

```javascript
import { defineStore } from 'pinia'

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    items: [],
    searchQuery: '',
    stats: { total: 0, pinned: 0 }
  }),

  getters: {
    filteredItems(state) {
      if (!state.searchQuery.trim()) return state.items
      const q = state.searchQuery.toLowerCase()
      return state.items.filter(item =>
        (item.preview || item.content || '').toLowerCase().includes(q)
      )
    }
  },

  actions: {
    async load() {
      this.items = await window.api.clipboard.list(50, 0) || []
      this.stats = await window.api.clipboard.stats() || { total: 0, pinned: 0 }
    },

    async search(query) {
      this.searchQuery = query
      if (!query.trim()) {
        await this.load()
        return
      }
      this.items = await window.api.clipboard.search(query) || []
    },

    async deleteItem(id) {
      await window.api.clipboard.delete(id)
      this.items = this.items.filter(item => item.id !== id)
    },

    async togglePin(id) {
      await window.api.clipboard.togglePin(id)
      const item = this.items.find(item => item.id === id)
      if (item) item.pinned = item.pinned ? 0 : 1
    },

    async clearAll() {
      await window.api.clipboard.clearAll()
      this.items = this.items.filter(item => item.pinned)
    },

    async paste(id) {
      await window.api.clipboard.paste(id)
    },

    addItem(item) {
      this.items.unshift(item)
      // 保持最多 100 条在内存中
      if (this.items.length > 100) {
        this.items = this.items.slice(0, 100)
      }
    }
  }
})
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/stores/clipboard.js
git commit -m "feat: clipboard Pinia store"
```

---

### Task 10: 邮件 Pinia Store

**Files:**
- Create: `src/renderer/src/stores/mail.js`

- [ ] **Step 1: 创建 stores/mail.js**

`src/renderer/src/stores/mail.js`:

```javascript
import { defineStore } from 'pinia'

export const useMailStore = defineStore('mail', {
  state: () => ({
    mails: [],
    selectedMail: null,
    isRunning: false,
    config: null
  }),

  actions: {
    async configure(config) {
      this.config = config
      const result = await window.api.mail.configure(config)
      this.isRunning = result?.ok === true
      return result
    },

    async load() {
      this.mails = await window.api.mail.list() || []
      this.isRunning = (await window.api.mail.status())?.running || false
    },

    async fetch() {
      await window.api.mail.fetch()
      await this.load()
    },

    async openDetail(id) {
      this.selectedMail = await window.api.mail.detail(id)
    },

    closeDetail() {
      this.selectedMail = null
    },

    async stop() {
      await window.api.mail.stop()
      this.isRunning = false
    }
  }
})
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/stores/mail.js
git commit -m "feat: mail Pinia store"
```

---

### Task 11: 剪切板面板组件

**Files:**
- Create: `src/renderer/src/components/ClipboardPanel.vue`

- [ ] **Step 1: 创建 ClipboardPanel.vue**

`src/renderer/src/components/ClipboardPanel.vue`:

```vue
<template>
  <div class="clipboard-panel">
    <div class="search-box">
      <Search :size="15" />
      <input
        v-model="searchQuery"
        type="search"
        placeholder="搜索剪切板历史..."
        @input="onSearch"
      />
      <button v-if="searchQuery" class="icon-button sm" @click="clearSearch">✕</button>
    </div>

    <div class="clip-stats">
      <span>{{ store.items.length }} 条记录</span>
      <button v-if="store.items.length" class="text-button" @click="clearAll">清空未固定</button>
    </div>

    <div class="clip-list" v-if="store.filteredItems.length">
      <div
        v-for="item in store.filteredItems"
        :key="item.id"
        class="clip-card"
        :class="{ pinned: item.pinned }"
        @click="pasteItem(item)"
      >
        <div class="clip-card-top">
          <span class="clip-type">{{ typeLabel(item.type) }}</span>
          <span class="clip-time">{{ formatTime(item.last_copied_at) }}</span>
        </div>
        <div class="clip-preview">{{ item.preview || item.content || '(空内容)' }}</div>
        <div class="clip-card-actions">
          <button class="icon-button sm" :title="item.pinned ? '取消固定' : '固定'" @click.stop="store.togglePin(item.id)">
            {{ item.pinned ? '📌' : '📍' }}
          </button>
          <button class="icon-button sm" title="删除" @click.stop="store.deleteItem(item.id)">🗑</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <span style="font-size:30px">📎</span>
      <p>暂无剪切板历史</p>
      <p class="hint">复制任意文字，这里会自动记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Search } from 'lucide-vue-next'
import { useClipboardStore } from '../stores/clipboard'

const store = useClipboardStore()
const searchQuery = ref('')

let unsubscribeNewItem = null

onMounted(async () => {
  await store.load()
  unsubscribeNewItem = window.api.clipboard.onNewItem((item) => {
    store.addItem(item)
  })
})

onUnmounted(() => {
  if (unsubscribeNewItem) unsubscribeNewItem()
})

function onSearch() {
  store.search(searchQuery.value)
}

function clearSearch() {
  searchQuery.value = ''
  store.search('')
}

async function pasteItem(item) {
  await store.paste(item.id)
}

async function clearAll() {
  await store.clearAll()
}

function typeLabel(type) {
  return { text: '文字', html: '网页', image: '图片' }[type] || type
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} 小时前`
  return d.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.clipboard-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
  color: var(--text-muted);
}
.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}
.clip-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 2px;
}
.text-button {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 11px;
  cursor: pointer;
}
.clip-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
}
.clip-card {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.clip-card:hover { border-color: var(--accent); }
.clip-card.pinned { border-left: 3px solid var(--accent); }
.clip-card-top {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.clip-preview {
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.clip-card-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.icon-button.sm {
  width: 24px;
  height: 24px;
  font-size: 12px;
}
.empty-state { text-align: center; color: var(--text-muted); padding: 40px 20px; }
.empty-state .hint { font-size: 11px; margin-top: 6px; opacity: 0.7; }
</style>
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/components/ClipboardPanel.vue
git commit -m "feat: clipboard panel component with search/pin/delete/paste"
```

---

### Task 12: 邮件面板组件

**Files:**
- Create: `src/renderer/src/components/MailPanel.vue`

- [ ] **Step 1: 创建 MailPanel.vue**

`src/renderer/src/components/MailPanel.vue`:

```vue
<template>
  <div class="mail-panel">
    <!-- 未配置状态 -->
    <div v-if="!configured" class="mail-setup">
      <span style="font-size:40px">📧</span>
      <h3>邮件设置</h3>
      <p>配置 Exchange 连接信息以拉取出货邮件</p>
      <form @submit.prevent="saveConfig" class="mail-form">
        <label class="field">
          <span>Exchange 服务器</span>
          <input v-model="form.server" type="text" placeholder="mail.company.com" required>
        </label>
        <label class="field">
          <span>邮箱地址</span>
          <input v-model="form.email" type="email" placeholder="you@company.com" required>
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="邮箱密码" required>
        </label>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? '连接中...' : '连接并开始拉取' }}
        </button>
        <p v-if="error" class="error-msg">{{ error }}</p>
      </form>
    </div>

    <!-- 已配置状态 -->
    <div v-else class="mail-list-view">
      <div class="mail-toolbar">
        <span>{{ store.mails.length }} 封邮件</span>
        <div>
          <button class="icon-button" :title="store.isRunning ? '已连接' : '未连接'" :class="{ active: store.isRunning }">
            {{ store.isRunning ? '🟢' : '🔴' }}
          </button>
          <button class="icon-button" title="手动拉取" @click="fetchNew">🔄</button>
          <button class="icon-button" title="断开" @click="disconnect">⏹</button>
        </div>
      </div>

      <div class="mail-list" v-if="store.mails.length">
        <div
          v-for="mail in store.mails"
          :key="mail.id"
          class="mail-card"
          :class="{ unread: !mail.is_read }"
          @click="openMail(mail)"
        >
          <div class="mail-card-top">
            <strong>{{ mail.subject }}</strong>
            <time>{{ formatTime(mail.received_at) }}</time>
          </div>
          <div class="mail-sender">{{ mail.sender }}</div>
          <div class="mail-preview">{{ (mail.body || '').slice(0, 100) }}</div>
        </div>
      </div>

      <div v-else class="empty-state">
        <span style="font-size:30px">📧</span>
        <p>暂无邮件</p>
        <button class="btn btn-secondary" @click="fetchNew">手动拉取</button>
      </div>
    </div>

    <!-- 邮件详情弹窗 -->
    <div v-if="store.selectedMail" class="mail-detail-overlay" @click.self="store.closeDetail()">
      <div class="mail-detail">
        <div class="mail-detail-header">
          <h3>{{ store.selectedMail.subject }}</h3>
          <button class="icon-button" @click="store.closeDetail()">✕</button>
        </div>
        <div class="mail-detail-meta">
          <span>发件人：{{ store.selectedMail.sender }}</span>
          <span>时间：{{ formatTime(store.selectedMail.received_at) }}</span>
        </div>
        <div class="mail-detail-body">{{ store.selectedMail.body }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMailStore } from '../stores/mail'

const store = useMailStore()
const form = ref({ server: '', email: '', password: '' })
const loading = ref(false)
const error = ref('')
const configured = ref(false)

onMounted(async () => {
  await store.load()
  configured.value = store.isRunning
  // 从 electron-store 读取已保存的配置
  const saved = window.api?.settings?.get?.()
  if (saved?.mailConfig) {
    form.value = saved.mailConfig
  }
})

async function saveConfig() {
  loading.value = true
  error.value = ''
  try {
    // 保存配置到 electron-store
    window.api?.settings?.save?.({ mailConfig: form.value })
    const result = await store.configure(form.value)
    if (result?.ok) {
      configured.value = true
      await store.fetch()
    } else {
      error.value = result?.error || '连接失败'
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function fetchNew() {
  await store.fetch()
}

async function openMail(mail) {
  await store.openDetail(mail.id)
}

async function disconnect() {
  await store.stop()
  configured.value = false
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} 小时前`
  return d.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.mail-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.mail-setup {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
}
.mail-setup h3 { margin: 10px 0 6px; color: var(--text); }
.mail-setup p { font-size: 12px; margin-bottom: 14px; }
.mail-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}
.field {
  display: grid;
  gap: 4px;
}
.field span { font-size: 12px; color: var(--text-muted); }
.field input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  font-size: 13px;
  background: var(--bg-input);
  color: var(--text);
  outline: 0;
}
.field input:focus { border-color: var(--accent); }
.btn { height: 34px; border: none; border-radius: var(--radius-control); font-size: 13px; cursor: pointer; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-secondary { border: 1px solid var(--border); background: var(--bg-input); color: var(--text); }
.error-msg { color: var(--danger); font-size: 12px; }

.mail-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted);
}
.mail-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.mail-card {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.mail-card:hover { border-color: var(--accent); }
.mail-card.unread { border-left: 3px solid var(--accent); }
.mail-card-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px; }
.mail-card-top strong { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-card-top time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.mail-sender { font-size: 11px; color: var(--accent); margin-bottom: 2px; }
.mail-preview { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-detail-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.5); display: grid; place-items: center; padding: 20px; }
.mail-detail { width: min(100%, 400px); max-height: 80vh; overflow-y: auto; padding: 16px; background: var(--bg-elevated); border-radius: var(--radius-panel); box-shadow: var(--shadow); }
.mail-detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mail-detail-header h3 { font-size: 16px; color: var(--text); }
.mail-detail-meta { font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.mail-detail-body { font-size: 13px; color: var(--text); white-space: pre-wrap; line-height: 1.6; }
.icon-button { display: inline-grid; width: 32px; height: 32px; place-items: center; border-radius: var(--radius-control); color: var(--text); background: var(--bg-card); border: none; cursor: pointer; font-size: 15px; }
.icon-button:hover { color: var(--accent-strong); background: var(--accent-soft); }
.icon-button.active { color: #fff; background: var(--accent); }
.empty-state { text-align: center; color: var(--text-muted); padding: 40px 20px; }
</style>
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/components/MailPanel.vue
git commit -m "feat: mail panel with setup form, list and detail view"
```

---

### Task 13: App.vue 三 Tab 集成

**Files:**
- Modify: `src/renderer/src/App.vue`

- [ ] **Step 1: 在 App.vue 底部（footer 下方、`</main>` 之前）添加 Tab 栏**

在 `<footer class="app-footer">...</footer>` 之后、`</main>` 闭合之前添加：

```html
<!-- Tab 导航 -->
<nav class="app-tabs">
  <button
    v-for="tab in tabs"
    :key="tab.id"
    class="tab-button"
    :class="{ active: activeTab === tab.id }"
    @click="activeTab = tab.id"
  >
    <span class="tab-icon">{{ tab.icon }}</span>
    <span class="tab-label">{{ tab.label }}</span>
  </button>
</nav>
```

在 `<script setup>` 中添加：

```javascript
const tabs = [
  { id: 'notes', icon: '📋', label: '便签' },
  { id: 'clipboard', icon: '📎', label: '剪切板' },
  { id: 'mail', icon: '📧', label: '邮件' }
]
const activeTab = ref('notes')
```

把现有便签内容包裹在 `v-show="activeTab === 'notes'"`：

```html
<header class="app-header" v-show="activeTab === 'notes'">
```

```html
<section v-show="activeTab === 'notes' && (!isMiniMode || modeTransition !== 'idle')" class="toolbar">
```

```html
<section class="note-list" v-show="activeTab === 'notes'" ...>
```

在 `</section>` (note-list) 之后、footer 之前添加：

```html
<ClipboardPanel v-show="activeTab === 'clipboard'" />
<MailPanel v-show="activeTab === 'mail'" />
```

在 `<script setup>` 的 import 中添加：

```javascript
import ClipboardPanel from './components/ClipboardPanel.vue'
import MailPanel from './components/MailPanel.vue'
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/App.vue
git commit -m "feat: add bottom tab navigation (notes/clipboard/mail)"
```

---

### Task 14: 邮件设置存储

**Files:**
- Modify: `src/main/ipc.js`（如果已有 settings:save handler）

- [ ] **Step 1: 确保 settings IPC handler 支持邮件配置的持久化**

检查 `src/main/ipc.js` 中是否已有 `settings:get` / `settings:save` handler。如果有，无需修改——邮件面板通过 `window.api.settings.save({ mailConfig: ... })` 即可保存。

如果没有，添加：

```javascript
ipcMain.handle('settings:get', () => {
  try { return store.get('settings', {}) }
  catch (err) { console.error('[ipc] settings:get 失败:', err.message); return {} }
})
ipcMain.handle('settings:save', (_, settings) => {
  try { store.set('settings', { ...store.get('settings', {}), ...settings }); return true }
  catch (err) { console.error('[ipc] settings:save 失败:', err.message); return false }
})
```

同时在 preload 中添加：

```javascript
settings: {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s)
}
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/main/ipc.js src/preload/index.js
git commit -m "feat: add settings IPC for mail config persistence"
```

---

### Task 15: Tab 样式

**Files:**
- Modify: `src/renderer/src/assets/styles/global.css`

- [ ] **Step 1: 在 global.css 末尾添加 Tab 栏样式**

```css
/* ===== Tab 导航 ===== */
.app-tabs {
  display: flex;
  border-top: 1px solid var(--border);
  padding: 2px 4px;
  gap: 2px;
}

.tab-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px 5px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-button:hover {
  background: var(--bg-card);
  color: var(--text);
}

.tab-button.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.tab-icon {
  font-size: 16px;
  line-height: 1;
}

.tab-label {
  font-size: 10px;
  font-weight: 600;
}
```

- [ ] **Step 2: 构建验证 + Commit**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
git add src/renderer/src/assets/styles/global.css
git commit -m "style: add tab navigation styles"
```

---

### Task 16: 最终构建验证

- [ ] **Step 1: 完整构建**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm run build
```

Expected: 所有模块（main / preload / renderer）构建成功，无报错。

- [ ] **Step 2: 检查构建产物**

```bash
ls out/main/index.js out/preload/index.mjs out/renderer/index.html
```

Expected: 三个文件都存在。

- [ ] **Step 3: 启动测试**

```bash
npx electron .
```

Expected: 应用启动，底部出现三个 Tab，切换到剪切板 Tab 后复制文字能看到记录。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: final integration build verification"
```
