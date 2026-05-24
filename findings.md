# Findings and Decisions

## Feature 1: 附件 Popover 交互

### 当前状态
卡片附件区域只显示 "📎 N 个附件"，无交互。编辑器内已有附件 chip（文件名+打开+删除）。

### 关键技术发现

**Electron 原生拖拽：** Renderer 进程可直接监听 drag/drop。从 Windows 文件管理器拖入的文件在 `event.dataTransfer.files` 中，每个 File 对象有 `.path` 属性。

**CSS transform 陷阱：** 元素上的 `transform`（包括 animation 中的）会创建新的 containing block，导致 `position: fixed` 不再相对视口定位。解决：外层 anchor div 纯 fixed 定位，内层 div 做 scale 动画。

**scroll 事件捕获：** `window.addEventListener('scroll', handler, true)` 用 capture 捕获子元素滚动。但 Electron frameless 窗口的 scroll 事件行为不同——需在滚动容器（.note-list overflow-y:auto）上测试。

**Vue Teleport：** `<Teleport to="body">` 在 Electron 中可能因 DOM 结构问题不生效。改用 `#popover-root` 专用容器更可靠。

### 技术决策
| Decision | Rationale |
|----------|-----------|
| 坐标值 props (anchorRight/anchorBottom/anchorTop) 代替 DOM 引用 | 避免 getBoundingClientRect 跨组件引用失效 |
| requestAnimationFrame 节流 recalc | 避免 scroll 高频触发导致 popover 抖动 |
| popover 可见时才重算位置 | 减少不必要的 computed 求值 |
| 整个 popover 为 drop zone（无 UI 提示） | 用户明确要求简洁 |

---

## Feature 2: 快捷键系统

### 当前状态
shortcuts.js 硬编码 F3/Escape/Alt+1~9，无穿透模式快捷键，无可自定义能力。

### 关键技术发现

**globalShortcut 注册范围：** `globalShortcut.register()` 注册的快捷键是系统级全局的。toggle-window 和 toggle-passthrough 需要注册为全局快捷键（窗口隐藏时也可触发）。hide-window 和 category 快捷键在 before-input-event 中处理（窗口内的）。

**独立 BrowserWindow 生命周期：** 快捷键配置窗口关闭时 hide 而非 destroy（与主窗口一致），避免重复创建。子窗口通过 `parent: this.window` 关联主窗口。

**electron-store defaults 不深合并：** `store.get('settings')` 在已存数据 `{ opacity: 0.92 }` 时不会自动填充 `defaults` 中的 `shortcuts` 字段。需要在 `getSettings()` 中手动回退。

**hash 路由复用渲染进程：** `#shortcut-editor` hash 让配置窗口与主窗口共用同一个 Vue 构建产物，避免多页构建配置。

**录制模式实现：** 在 ShortcutEditor 中通过 `window.addEventListener('keydown', handler, true)` capture 阶段拦截按键，过滤纯修饰键（Ctrl/Alt/Shift/Meta），格式化组合键字符串。

### 技术决策
| Decision | Rationale |
|----------|-----------|
| Ctrl+Shift+P 默认值 | 不与其他快捷键冲突，与 VS Code 命令面板一致 |
| 独立 BrowserWindow 而非主窗口内浮层 | 用户明确要求托盘入口+独立窗口 |
| recordingId 单例状态 | 同时只能录制一个快捷键 |
| 冲突时清空旧绑定 | 简单直观，不阻塞用户操作 |
| 快捷键格式：Ctrl+Shift+P | 与 Electron accelerator 格式兼容 |

---

## 全局发现

**CSS 变量系统：** 项目使用 `--accent` / `--accent-soft` / `--accent-strong` / `--text` / `--text-muted` / `--danger` / `--border` 等变量。新组件需保持一致。

**窗口关闭模式：** 所有独立窗口关闭时 hide 而非 destroy，`event.preventDefault()` 拦截 close 事件。确保下次打开时复用。

**单实例锁文件：** `%APPDATA%\bianqian-electron\lockfile` 在 force-kill 进程后会残留，导致后续启动失败。正常退出（托盘→退出）会自动清理。调试时需手动删除。

**electron-builder asar integrity：** `updating asar integrity` 步骤会损坏 electron.exe。当前通过 `"asar": false` 绕过。
