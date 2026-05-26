# 便签 Electron 版 — 架构设计文档

> 日期：2026-05-27 | v0.5.1

---

## 一、进程架构

```
┌─────────────────────────────────────────────────────┐
│  主进程 (Main Process)                               │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────┐   │
│  │ index.js │ │ tray.js   │ │ window-manager.js│   │
│  │ 入口      │ │ 托盘控制器 │ │ 窗口生命周期      │   │
│  └──────────┘ └───────────┘ └────────┬─────────┘   │
│  ┌──────────┐ ┌───────────┐ ┌───────┴─────────┐   │
│  │ store.js │ │shortcuts.js│ │ edge-dock.js    │   │
│  │ 数据持久化│ │ 快捷键管理 │ │ 边缘吸附控制器   │   │
│  └──────────┘ └───────────┘ └─────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ ipc.js — IPC 处理器（store 锁并发）            │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  预加载 (Preload)                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ index.js — contextBridge + 全局拖拽兜底        │   │
│  │ 暴露 window.api.{notes,files,window,...}       │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  渲染进程 (Renderer)                                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ App.vue — 主界面 + 设置面板 + 编辑器 + 尺寸管理 │   │
│  ├──────────────────────────────────────────────┤   │
│  │ AttachmentPopover.vue — 附件面板 [#popover]    │   │
│  │ ShortcutEditor.vue — 快捷键录制 [#shortcut]    │   │
│  ├──────────────────────────────────────────────┤   │
│  │ stores/notes.js — Pinia Store                 │   │
│  │  actions → IPC（主路径） || localStorage（回退） │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 二、数据流

### 2.1 便签 CRUD

```
renderer                       main                        store
   │                             │                            │
   │ notes.create(payload)       │                            │
   │ ──ipc:notes:create────────► │                            │
   │                             │ withLock(() =>             │
   │                             │   createNote(payload))     │
   │                             │ ─────────────────────────► │
   │                             │                            │ normalizeNote
   │                             │                            │ getBackingStore.set
   │                             │ ◄───────────────────────── │ return note
   │ ◄──return note───────────── │                            │
   │                             │                            │
   │ notes.syncTrayCounts()      │                            │
   │ ──tray:update-counts──────► │ tray.rebuildMenu(counts)   │
```

### 2.2 交互状态广播

```
main.windowManager              main.tray             renderer
   │                              │                      │
   │ broadcastInteractionState()  │                      │
   │ ──send(interaction-state)─────────────────────────► │
   │                              │                      │ onInteractionState()
   │ interactionStateListener()   │                      │ 更新 refs
   │ ───────────────────────────► │ rebuildMenu()        │
   │                              │ updateIcon()         │
```

### 2.3 边缘吸附

```
window 'moved'
   │
   ▼
WindowManager.onWindowMoved()
   │ 委托
   ▼
EdgeDockController.onWindowMoved()
   │ 80ms 去抖
   ▼
EdgeDockController.checkSnap()
   │ 检测屏幕边缘 ≤20px
   ├─ _dockLeft()  → state = DOCKED_LEFT,  setBounds(x: workArea.x)
   └─ _dockRight() → state = DOCKED_RIGHT, setBounds(x: workArea.right - width)

隐藏触发（双通道）:
  A) renderer document.mouseout(relatedTarget=null)
     → IPC mouse-leave → onMouseLeave() → scheduleHide(500ms) → hide()
  B) 50ms 轮询 _checkMouse()
     → 鼠标不在窗口内 && !_hideTimer → scheduleHide(500ms)

唤出触发:
  50ms 轮询 → 鼠标碰边缘(4px) && isHidden() → show()

动画:
  cubic ease-out (1-(1-t)³), 180ms, setTimeout(tick, 16ms) 递归
```

### 2.4 卡片拖动排序

```
mousedown on .note-card (非 mini、左键、非 button)
   │ 记录起始坐标 + 卡片高度/间距
   │ document 级 mousemove + mouseup 监听
   ▼
onSortMouseMove
   │ dx/dy < 5px → 不激活（防止误触）
   │ 激活 sortDrag.active → 卡片 shadow 上浮
   ▼
   │ deltaY / step → shiftCount
   │ 被跨越卡片 translateY(-step|+step) 让位
   │ 拖拽卡 translateY(deltaY)
   ▼
onSortMouseUp
   │ 计算目标索引 → targetId + 'before'|'after'
   │ notes.reorderNote(fromId, toId, position)
   │ 本地 splice → 批量 IPC update order 字段
   │ skipNextResize = true 防窗口抖动
   │ sortDragJustEnded 100ms 保护防误开编辑器
```

### 2.5 附件导入

```
拖拽文件 → preload window.message
   │
   ▼
App.vue onPreloadFileDrop()
   │ 通过 elementFromPoint 查找目标卡片
   ▼
addDroppedPathsToNote(note, paths)
   │ 去重（1.2s 内同一 note+paths 忽略）
   ▼
addAttachmentsToNote(note, paths)
   │ 计算剩余 slots
   │ 调用 notes.importAttachments() → main copyAttachments()
   │ 合并 attachments（Set 去重，上限10）
   │ notes.update()
   │ cleanupUnusedCopies() → 清理未引用副本
```

---

## 三、关键设计决策

### 3.1 EdgeDockController 独立模块

**问题：** 边缘逻辑最初内嵌在 window-manager.js 中，9 个方法互相缠绕，8 个 guard boolean 难以调试。

**方案：** 抽取为独立的 `EdgeDockController` 类，通过 window getter 和回调与 WindowManager 通信：
- `onStateChange` → 广播交互状态
- `onInteractionChange` → 更新穿透/可聚焦状态
- 暴露 `autoHide`、`isPinned`、`isEditing` 等公共属性

**收益：** window-manager.js 从 ~800 行缩减到 ~470 行；边缘行为可独立测试和扩展。

### 3.2 Store 操作串行化

**问题：** Electron IPC 可并发调用 store 操作，electron-store 无内置锁，可能导致数据竞争。

**方案：** `withLock(fn)` 使用 Promise 链将操作串行化：
```javascript
let storeLock = Promise.resolve()
function withLock(fn) {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  storeLock = storeLock.then(
    () => { try { resolve(fn()) } catch (err) { reject(err) } },
    (err) => reject(err)
  )
  return promise
}
```

### 3.3 #popover-root 隔离层

**问题：** Electron transparent frameless 窗口中，`backdrop-filter`/`clip-path`/`isolation: isolate` 会创建 GPU 合成层，污染 `position: fixed` 的 containing block。

**方案：** 创建专用的固定定位隔离层：
```css
#popover-root {
  position: fixed; inset: 0;
  transform: none; filter: none; backdrop-filter: none;
  contain: layout style;
  z-index: 2147483000;
  pointer-events: none;
}
```
所有浮动 UI（context menu、settings panel、attachment popover）通过 Teleport 渲染到 `#popover-root`，内部用 `position: absolute`。

### 3.4 附件 UUID 命名 + 路径校验

**问题：** 原始文件名附加时间戳易冲突；用户可通过 IPC 打开任意路径。

**方案：**
- 复制文件时用 `randomUUID()` + 原扩展名
- `isAttachmentPath()` 校验目标路径必须在 `attachments/` 目录下
- `shell:open-path` handler 仅允许已校验的附件路径

### 3.5 localStorage 回退

**问题：** 开发阶段 preload 未加载时，IPC 不可用，应用完全无数据。

**方案：** Pinia Store 的每个 action 检测 `window.api` 是否存在：
- 存在 → IPC 调用主进程
- 不存在 → `localStorage` 读写（`fallbackLoad/fallbackSave`）

### 3.6 窗口高度自适应

**问题：** 固定高度浪费空间（无内容的空便签也占满 500px）。

**方案：**
- `ResizeObserver` 监听 `app-shell` 变化
- `syncContentHeight()` 计算 header + toolbar + note-list + footer 实际高度
- mini 模式：drag-bar + 最多 3 张卡片高度
- 列表模式：>3 条时随内容增长，≤3 条保持 minHeight 360
- 通过 `window:resize-to-content` IPC 通知主进程 `setBounds`

---

## 四、模块接口

### 4.1 WindowManager

```javascript
class WindowManager {
  edge: EdgeDockController           // 边缘控制器实例

  createFloatingWindow() → BrowserWindow
  show(category) / hide() / toggle()
  getInteractionState() → { opacity, passThrough, windowMode, edgeAutoHide, edgeState }
  setPassThroughMode(enabled)
  setOpacity(value)                  // 0.35-1.0
  setWindowMode('normal'|'mini')
  setEdgeAutoHide(enabled)
  resizeToContent(contentHeight)     // 自适应内容高度
  ensureVisibleInWorkArea()          // 多显示器约束
  broadcastInteractionState()        // → renderer + listener
  openShortcutEditor()
}
```

### 4.2 EdgeDockController

```javascript
class EdgeDockController {
  state: EDGE_STATE                  // NORMAL | DOCKED_* | HIDDEN_*
  autoHide: boolean                  // 是否启用收纳
  isPinned: boolean                  // 置顶禁止隐藏
  isEditing: boolean                 // 编辑中禁止隐藏

  onWindowMoved()                    // 'moved' 事件入口
  onMouseLeave()                     // renderer mouseout 入口
  onMouseEnter()                     // renderer mouseover 入口
  show()                             // 从隐藏状态弹出
  restoreImmediate({ keepDock })     // 立即恢复（hide/close 时）
  startMouseWatcher() / stopMouseWatcher()
  destroy()
}
```

### 4.3 IPC 接口

```javascript
// notes
ipcMain.handle('notes:list' | 'notes:create' | 'notes:update' |
               'notes:delete' | 'notes:toggle' | 'notes:save-all')

// files
ipcMain.handle('dialog:select-attachments' | 'files:import-attachments' |
               'files:cleanup-attachments' | 'files:max-attachments-per-note' |
               'shell:open-path')

// window
ipcMain.handle('window:show' | 'window:hide' | 'window:new-note' |
               'window:get-interaction-state' | 'window:set-pass-through' |
               'window:set-opacity' | 'window:set-mode' |
               'window:set-edge-auto-hide')
ipcMain.on('window:mouse-leave' | 'window:mouse-enter' |
           'window:set-editing' | 'window:set-pinned' |
           'window:resize-to-content')

// shortcuts
ipcMain.handle('shortcuts:list' | 'shortcuts:update' |
               'shortcuts:reset' | 'shortcuts:start-record' |
               'shortcuts:stop-record')
```

### 4.4 Preload API (window.api)

```
api.categories.list()
api.notes.{list, create, update, delete, toggle, saveAll}
api.files.{selectAttachments, importAttachments, cleanupAttachments,
           maxAttachmentsPerNote, pathsFromFiles, openPath}
api.tray.updateCounts(counts)
api.window.{hide, show, newNote, getInteractionState, setPassThrough,
            setOpacity, setMode, setEdgeAutoHide, resizeToContent,
            mouseLeave, mouseEnter, setEditing, setPinned,
            onFilterCategory, onCreateNote, onInteractionState}
api.shortcuts.{list, update, reset, startRecord, stopRecord, onKeydown}
```

---

## 五、CSS 架构

### 5.1 变量体系 (variables.css)

```css
--accent: #2f7d78
--accent-strong: #1e4f4b
--accent-soft: rgba(47, 125, 120, 0.08)
--bg-window: rgba(255, 255, 255, 0.85)
--bg-card: rgba(255, 255, 255, 0.68)
--bg-card-hover: rgba(255, 255, 255, 0.92)
--text: #263936
--text-muted: #6e807c
--border: rgba(38, 57, 54, 0.08)
--danger: #e24a4a
--shadow: 0 1px 24px rgba(0, 0, 0, 0.12)
--radius-window: 18px
--radius-panel: 12px
--radius-control: 8px
--radius-small: 6px
```

### 5.2 关键模式

**圆角裁切：**
```css
.app-shell {
  border-radius: var(--radius-window);
  clip-path: inset(0 round var(--radius-window));
  backdrop-filter: blur(18px);
  isolation: isolate;
}
```

**Popup 隔离层：**
```css
#popover-root {
  position: fixed; inset: 0;
  transform: none; filter: none; backdrop-filter: none;
  contain: layout style;
  z-index: 2147483000;
  pointer-events: none;
}
#popover-root > * { pointer-events: auto; }
```

**grid-template-rows 自适应：**
```css
.app-shell {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  /* JS 通过 noteList.style.maxHeight 控制列表区高度 */
}
```

---

## 六、已知约束

| 约束 | 说明 |
|---|---|
| asar 禁用 | `asar: true` 损坏 electron.exe 二进制，必须 `asar: false` |
| sandbox 禁用 | 子窗口（ShortcutEditor）preload ES module 需要 `sandbox: false` |
| electron-store 默认值 | 不深度合并已有数据，需 spread `{ ...DEFAULTS, ...stored }` |
| transparent 窗口 | `backdrop-filter`/`clip-path` 创建 GPU 合成层，`position:fixed` 元素需隔离 |
| globalShortcut | 录制前 unregisterAll 避免冲突；注册失败需回退旧快捷键 |
| setFocusable | Windows/Linux 可用方法，macOS 无效果（TypeError 防护） |
