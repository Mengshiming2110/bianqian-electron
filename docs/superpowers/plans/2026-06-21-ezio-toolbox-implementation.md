# Ezio的百宝箱 v1.0.0 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Electron 便签项目重构为 Ezio的百宝箱 — 便签 + 剪切板 + 邮件三 Tab 桌面工具箱，全新视觉设计

**Architecture:** 保留 Electron 28 + Vue 3 + Pinia。新增 better-sqlite3（剪切板+邮件存储）、clipboard-monitor（剪切板轮询）、mail-bridge（.NET EWS 子进程管理）。UI 全面刷新为 Ethereal Glass double-bezel 设计系统。

**Design Spec:** `docs/superpowers/specs/2026-06-21-design-decisions.md`（67 项决策，实现唯一依据）

**Tech Stack:** Electron 28 + Vue 3 + Pinia + better-sqlite3 + SVG icon system + electron-store（已有）

---

## 文件映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 改 | 名称→ezio-toolbox，v1.0.0，appId/publish，添加 better-sqlite3 |
| `electron.vite.config.js` | 改 | 更新 main 入口配置 |
| `src/main/database.js` | 新 | SQLite 初始化 + clipboard_items + mail_items 建表 |
| `src/main/clipboard-monitor.js` | 新 | 剪切板 500ms 轮询 + hash 去重 + 上限清理 + 自粘贴忽略 |
| `src/main/mail-bridge.js` | 新 | MailService.exe 子进程管理（spawn + HTTP JSON） |
| `src/main/ipc-clipboard.js` | 新 | 剪切板 IPC（list/search/delete/togglePin/clearAll/paste/stats/selectMode） |
| `src/main/ipc-mail.js` | 新 | 邮件 IPC（configure/list/fetch/detail/stop/status） |
| `src/main/ipc-settings.js` | 新 | 设置 IPC（剪切板上限/开机自启/邮件间隔） |
| `src/main/index.js` | 改 | 启动 database + 剪切板监听 + 邮件桥接 + 托盘更新 + 窗口状态记忆 |
| `src/main/tray.js` | 改 | 托盘菜单新增 Tab 入口/暂停监听/关于 |
| `src/main/window-manager.js` | 改 | 窗口最小化到托盘，多显示器位置记忆 |
| `src/main/store.js` | 改 | 设置新增剪切板上限/邮件配置/开机自启 |
| `src/preload/index.js` | 改 | 新增 clipboard/mail/settings bridge + reminder-due 事件 |
| `src/renderer/src/stores/clipboard.js` | 新 | 剪切板 Pinia store（list/search/delete/pin/selectMode） |
| `src/renderer/src/stores/mail.js` | 新 | 邮件 Pinia store（configure/list/fetch/detail/error） |
| `src/renderer/src/components/ClipboardPanel.vue` | 新 | 剪切板面板（double-bezel 卡片 + 多选） |
| `src/renderer/src/components/MailPanel.vue` | 新 | 邮件面板（登录卡片/列表/详情弹窗+提取表格） |
| `src/renderer/src/components/WelcomeCard.vue` | 新 | 首次使用欢迎卡片 |
| `src/renderer/src/components/AboutCard.vue` | 新 | 关于弹窗 |
| `src/renderer/src/App.vue` | 改 | 三 Tab 容器 + 分类标签 + 搜索栏 + header 按钮 + footer |
| `src/renderer/src/assets/styles/variables.css` | 改 | 更新为新设计令牌 |
| `src/renderer/src/assets/styles/global.css` | 改 | 新增 Tab/卡片/剪切板/邮件/多选/所有新样式 |

---

### Task 1: 项目基础重配置

**Files:** `package.json`, `electron.vite.config.js`

- [ ] **Step 1: 安装 better-sqlite3**

```bash
cd "D:/便签/bianqian-electron-clipboard"
npm install better-sqlite3
```

- [ ] **Step 2: 更新 package.json**

```json
{
  "name": "ezio-toolbox",
  "version": "1.0.0",
  "description": "Ezio的百宝箱 — 便签·剪切板·邮件 三合一桌面工具箱",
  "author": "Ezio",
  "main": "out/main/index.js",
  "build": {
    "appId": "com.ezio.toolbox",
    "productName": "Ezio的百宝箱",
    "asar": false,
    "publish": {
      "provider": "github",
      "owner": "Mengshiming2110",
      "repo": "bianqian-electron"
    }
  }
}
```

- [ ] **Step 3: 更新 electron.vite.config.js** — 确保 externalizeDepsPlugin 覆盖 better-sqlite3（已在 `main.plugins` 中）

- [ ] **Step 4: 构建验证**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron.vite.config.js
git commit -m "chore: rename to ezio-toolbox v1.0.0, add better-sqlite3, update builder config"
```

---

### Task 2: SQLite 数据库初始化

**Files:** `src/main/database.js`

- [ ] **Step 1: 创建 database.js**

完整代码见设计 spec Section 4.3。建表：`clipboard_items`（id/type/content/preview/source_app/hash/pinned/copy_count/created_at/last_copied_at）+ `mail_items`（id/subject/sender/body/received_at/is_read/extracted_fields）。索引：`idx_clipboard_hash`、`idx_clipboard_created`、`idx_mail_received`。WAL 模式 + NORMAL synchronous。

导出 `initDatabase()` / `getDatabase()` / `closeDatabase()`。

- [ ] **Step 2: 构建 + Commit**

---

### Task 3: 剪切板监听器

**Files:** `src/main/clipboard-monitor.js`

- [ ] **Step 1: 创建 clipboard-monitor.js**

500ms 轮询。优先级：image > HTML > text。SHA256 前 16 位 hash 去重。新内容写入 SQLite + 更新 copy_count。超过上限清理最旧非固定项。**自粘贴忽略**：`writeToClipboard()` 设置 `lastSelfPasteHash`，下一轮轮询检测到同 hash 跳过。

`startClipboardMonitor(onNewItem)` / `stopClipboardMonitor()` / `writeToClipboard(id)` / `setLimit(N)`。

- [ ] **Step 2: 构建 + Commit**

---

### Task 4: 剪切板 IPC Handler

**Files:** `src/main/ipc-clipboard.js`

- [ ] **Step 1: 创建 ipc-clipboard.js**

通道：`clipboard:list(limit,offset)` / `clipboard:search(query)` / `clipboard:delete(id)` / `clipboard:togglePin(id)` / `clipboard:clearAll` / `clipboard:paste(id)` / `clipboard:stats`。paste 调用 `writeToClipboard()`（触发自粘贴忽略逻辑）。

全部 handler 包裹 try-catch，返回安全默认值。

- [ ] **Step 2: 构建 + Commit**

---

### Task 5: 邮件桥接器

**Files:** `src/main/mail-bridge.js`

- [ ] **Step 1: 创建 mail-bridge.js**

`MailBridge` class。`start(config)` spawn `MailService.exe` + 随机端口 9800-9999。`_sendConfig()` POST `/start`。`fetchMails(since)`、`fetchMailDetail(id)`。`stop()` POST `/stop` + kill。崩溃自动重试 3 次。healthCheck 每 30s。

导出 `MailBridge` class。

- [ ] **Step 2: 构建 + Commit**

---

### Task 6: 邮件 IPC Handler

**Files:** `src/main/ipc-mail.js`

- [ ] **Step 1: 创建 ipc-mail.js**

通道：`mail:configure(config)`（保存配置+启动子进程）/ `mail:list` / `mail:fetch`（手动拉取）/ `mail:detail(id)` / `mail:stop` / `mail:status`。

全部 handler 包裹 try-catch。`mail:configure` 验证连接，错误信息根据返回码映射（密码错误/网络断开/服务器不可达）。

导出 `setupMailHandlers()` / `stopMailBridge()`。

- [ ] **Step 2: 构建 + Commit**

---

### Task 7: 设置 IPC Handler

**Files:** `src/main/ipc-settings.js`（如已有则扩展 store.js 和 ipc.js）

- [ ] **Step 1: 扩展设置存储**

`src/main/store.js` 中 settings schema 新增：
```javascript
clipboardLimit: { type: 'number', default: 50 },
autoStart:     { type: 'boolean', default: false },
mailInterval:  { type: 'number', default: 5 },
mailConfig:    { type: 'object', default: { server: '', email: '', password: '' } }
```

- [ ] **Step 2: IPC 通道**

`settings:get` / `settings:save`（已有则扩展）。新增 `settings:getClarboardLimit` → 传给 clipboard-monitor.setLimit()。

- [ ] **Step 3: 构建 + Commit**

---

### Task 8: 主进程入口集成

**Files:** `src/main/index.js`

- [ ] **Step 1: 完整集成**

启动顺序：`initStore` → `initDatabase` → `setupIpcHandlers` → `setupClipboardHandlers` → `setupMailHandlers` → `createCloudWindow` → `bindHoverInteraction` → `setupTray` → `setupShortcuts` → `startClipboardMonitor`。

启动时读取 windowState（位置+可见性）。窗口 `minimize` 事件 → `hide()` + 设置 `skipTaskbar: true`。`restore` 事件 → `show()` + `skipTaskbar: false`。

`will-quit`：`stopClipboardMonitor` → `stopMailBridge` → `closeDatabase` → `destroyCloudWindow` → `destroyTray`。

电 `unhandledRejection` 兜底（已有，保留）。

- [ ] **Step 2: 构建 + Commit**

---

### Task 9: 系统托盘更新

**Files:** `src/main/tray.js`

- [ ] **Step 1: 更新托盘菜单**

完整结构（决策 #44）：
```
📋 便签     → show + filter '全部' + 切到 notes Tab
📎 剪切板   → show + 切到 clipboard Tab
📧 邮件     → show + 切到 mail Tab
────────────
📂 分类 →
  (子菜单: 工作/生活/学习/会议/其他)
────────────
➕ 新建便签
────────────
👁 穿透开关
⏸ 暂停剪切板监听
────────────
ℹ 关于     → 发送 'about' 事件给渲染进程
✕ 退出
```

托盘 tooltip: `"Ezio的百宝箱"`。click 事件不变（toggle 窗口）。暂停监听时托盘图标变灰或显示小标记（决策 #67）。

- [ ] **Step 2: 构建 + Commit**

---

### Task 10: 窗口管理器更新

**Files:** `src/main/window-manager.js`

- [ ] **Step 1: 最小化到托盘**

`cloudWindow.on('minimize', (e) => { e.preventDefault(); cloudWindow.hide(); })`

- [ ] **Step 2: 多显示器位置记忆**

`cloudWindow.on('moved', () => saveWindowBounds())` + `on('resized', ...)`。`createCloudWindow` 从 store 读取上次位置，找不到则回退默认右上角。检测屏幕是否还存在，不存在则回退主屏。

- [ ] **Step 3: 构建 + Commit**

---

### Task 11: Preload 桥接扩展

**Files:** `src/preload/index.js`

- [ ] **Step 1: 新增三个命名空间**

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
},
settings: {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s)
}
```

- [ ] **Step 2: 构建 + Commit**

---

### Task 12: 设计令牌更新

**Files:** `src/renderer/src/assets/styles/variables.css`

- [ ] **Step 1: 替换为新的令牌系统**

完全替换 `:root` 和 `[data-theme="dark"]` 块为设计决策 §2.1 中定义的完整令牌集（背景/卡片/文字/边框/accent/圆角/阴影全部变量）。

删除不用的旧变量。保留现有 `--danger` / `--warning`。新增 `--ease-out-expo` / `--ease-spring` CSS 变量。

- [ ] **Step 2: Commit**

---

### Task 13: 全局样式更新

**Files:** `src/renderer/src/assets/styles/global.css`

- [ ] **Step 1: 新增所有新样式**

新增（不删除现有样式，在后面追加）：
- `.app-outer` / `.app-inner` — double-bezel 窗口外壳
- `.card-wrap` / `.card` — 双层卡片结构 + pinned + done + hover 渐变
- `.tab-bar-outer` / `.tab-bar` / `.tab-btn` — 浮动 pill Tab 栏 + active 滑动高亮
- `.search-wrap` — 统一搜索框
- `.stats-bar` / `.clear-btn` — 统计栏
- `.clip-card` / `.type-badge` / `.clip-actions` / `.mini-btn` — 剪切板卡片
- `.mail-card` / `.mail-setup` / `.mail-toolbar` — 邮件卡片和设置
- `.login-card-outer` / `.login-card` — 邮件登录卡片
- `.extract-table` — 提取字段竖排表格
- `.detail-overlay` / `.detail-panel` — 邮件详情弹窗
- `.select-mode` / `.select-check` — 多选模式
- `.welcome-overlay` / `.welcome-card` — 欢迎卡片
- `.about-overlay` / `.about-card` — 关于弹窗
- `.field` / `.field input` / `.btn-primary` / `.btn-secondary` — 表单 + 按钮
- `.cat-tabs` / `.cat-tab` — 分类标签栏
- `.empty-state` — 空状态

全部暗色/浅色双模式。所有过渡使用 `var(--ease-out-expo)`。

- [ ] **Step 2: Commit**

---

### Task 14: SVG 图标系统

**Files:** `src/renderer/index.html`

- [ ] **Step 1: 将 SVG sprite 注入 index.html**

在 `<body>` 标签内最上方添加完整的 SVG symbol sprite（search/plus/minus/x/check/pin/trash/clipboard/mail/notes/settings/refresh/power/arrow-right/lock/picture/file/link/circle/status-on/copy）。1.5px 笔画，viewBox 24x24。

- [ ] **Step 2: Commit**

---

### Task 15: 剪切板 Pinia Store

**Files:** `src/renderer/src/stores/clipboard.js`

- [ ] **Step 1: 创建 store**

State: `items[]`, `searchQuery`, `stats`, `selectMode`, `selectedIds[]`

Actions: `load()` / `search(query)` / `deleteItem(id)` / `togglePin(id)` / `clearAll()` / `paste(id)` / `addItem(item)` / `enterSelectMode()` / `exitSelectMode()` / `toggleSelect(id)` / `selectAll()` / `deleteSelected()`。

Getters: `filteredItems`（过滤 pinned 优先 + 时间排序）。

- [ ] **Step 2: 构建 + Commit**

---

### Task 16: 邮件 Pinia Store

**Files:** `src/renderer/src/stores/mail.js`

- [ ] **Step 1: 创建 store**

State: `mails[]`, `selectedMail`, `isRunning`, `config`, `error`, `lastSync`, `unreadCount`

Actions: `configure(config)` / `load()` / `fetch()` / `openDetail(id)` / `closeDetail()` / `stop()`。

`configure` 错误处理：根据返回码区分"密码错误"/"网络断开"/"服务器不可达"。

- [ ] **Step 2: 构建 + Commit**

---

### Task 17: 剪切板面板组件

**Files:** `src/renderer/src/components/ClipboardPanel.vue`

- [ ] **Step 1: 完整组件**

```vue
<template>
  <!-- 搜索框（复用 search-wrap） -->
  <!-- 统计栏 / 多选工具栏 -->
  <!-- 卡片列表：card-wrap > card.clip-card -->
  <!--   类型标签 + 相对时间 + 内容预览 + pin/delete 按钮 -->
  <!--   多选模式：左侧复选框 -->
  <!-- 空状态 -->
</template>
```

功能：实时搜索过滤。单击 = 粘贴回剪切板（条目短暂高亮闪烁 200ms）。双击 = 详情弹出（大文本框）。右键菜单：粘贴/固定切换/删除。多选模式："选择"按钮 → "已选N项 + 全选 + 取消 + 删除所选"。

时间显示：相对时间（决策 #62）。

- [ ] **Step 2: 构建 + Commit**

---

### Task 18: 邮件面板组件

**Files:** `src/renderer/src/components/MailPanel.vue`

- [ ] **Step 1: 完整组件**

两种状态：

**未配置状态**：内嵌登录卡片（决策 #4.1）。居中 card-wrap > login-card。邮件 icon + "连接 Exchange" h3 + 说明文字 + 三个输入框（Exchange 服务器/邮箱地址/密码）+ "连接邮箱" pill 按钮（arrow-in-circle 右侧图标）+ 底部辅助链接。连接失败显示红色错误文字（区分密码错误/网络断开/服务器不可达）。

**已连接状态**：顶部工具栏（邮件数量+绿色连接指示灯+刷新+断开按钮）。邮件列表（card-wrap > card.mail-card）。新邮件左侧 2px accent 色条。每行：主题 bold + 发件人 accent 色 + 摘要。点击打开详情弹窗。

**详情弹窗**：居中 overlay + detail-panel。标题+发件人+时间+正文。底部竖排数据表（无表头，字段:值，值 accent 色可点击复制）。

- [ ] **Step 2: 构建 + Commit**

---

### Task 19: 欢迎卡片和关于弹窗

**Files:** `src/renderer/src/components/WelcomeCard.vue`, `src/renderer/src/components/AboutCard.vue`

- [ ] **Step 1: WelcomeCard**

居中 overlay。卡片内容：背包 icon + "欢迎使用 Ezio的百宝箱" + 三个功能介绍 + 托盘提示 + F3 提示。底部"开始使用"按钮。只在首次启动显示（标记存 electron-store）。

- [ ] **Step 2: AboutCard**

居中 overlay。卡片内容：应用名 + 版本号 + "便签·剪切板·邮件 — 三合一桌面工具箱" + "基于 Electron + Vue 3 构建"。底部"关闭"按钮。

- [ ] **Step 3: 构建 + Commit**

---

### Task 20: App.vue 三 Tab 重构

**Files:** `src/renderer/src/App.vue`

- [ ] **Step 1: 完整重构**

这是最大的单次改动。重构 template：

```
main.app-shell
├── header.app-header
│   ├── .header-left → eyebrow: "Ezio的百宝箱", h1: 随Tab变化
│   └── .header-actions → 设置 + Tab相关按钮 + 隐藏
├── .mini-drag-bar (v-show mini)
├── section.toolbar (v-show !mini)
│   ├── .search-wrap → placeholder 随Tab变化
│   └── .cat-tabs (仅便签Tab显示)
├── 三个面板 (v-show activeTab)
│   ├── section.note-list → 原有便签内容
│   ├── ClipboardPanel
│   └── MailPanel
├── footer.app-footer → 内容随Tab变化
└── nav.app-tabs → 三Tab pill导航
```

Script 新增：`activeTab` ref / `tabs` 常量 / Tab 切换逻辑 / header 按钮逻辑 / placeholder 计算 / footer 计算 / WelcomeCard 控制。

保留全部现有功能：editor overlay、AttachmentPopover、ShortcutEditor、sortDrag、mini mode 切换、预设模式、passThrough、Reminder 等。

Mini 模式下剪切板和邮件 Tab 按钮 disabled。

- [ ] **Step 2: 构建 + Commit**

---

### Task 21: 设置面板更新

**Files:** `src/renderer/src/components/SettingsWindow.vue`

- [ ] **Step 1: 新增设置项**

在现有设置下方新增两个 section：
1. **剪切板**：历史记录上限（20/50/100 三选一）
2. **系统**：开机自启动（开关）+ 邮件拉取间隔（1/5/15/30 分钟下拉）

底部加版本号 "v1.0.0"。

- [ ] **Step 2: 构建 + Commit**

---

### Task 22: 最终集成验证

- [ ] **Step 1: 完整构建**

```bash
npm run build
```

Expected: 三模块全绿。

- [ ] **Step 2: 启动测试**

```bash
npx electron .
```

验证清单：
- [ ] 窗口启动，底部三 Tab
- [ ] Tab 切换正常，内容对应
- [ ] 暗色/浅色主题切换正常
- [ ] 剪切板监听自动开启（复制文字后切换到剪切板 Tab 能看到）
- [ ] 剪切板单击粘贴 + 闪烁反馈
- [ ] 剪切板右键菜单正常
- [ ] 剪切板多选模式工作
- [ ] 邮件 Tab 登录表单显示
- [ ] 托盘菜单新结构正确
- [ ] 托盘 tooltip 显示新名称
- [ ] 关于弹窗正常
- [ ] 最小化到托盘
- [ ] F3 切换窗口
- [ ] 便签原有功能不受影响

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```
