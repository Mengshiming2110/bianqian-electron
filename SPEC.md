# 便签 Electron 版 — 功能规格文档

> 本文档是开发的唯一事实来源。每个功能必须有对应的 SPEC 条目。
> 日期：2026-05-26 | 最后更新：2026-05-27 (v0.5.1)

---

## 一、架构概览

### 1.1 设计原则

| 原则 | 说明 |
|---|---|
| 无主窗口 | 便签完全通过云游窗口 + 系统托盘操作，无固定主界面 |
| 模块分离 | main/renderer/preload 三层清晰隔离；边缘逻辑独立为 EdgeDockController |
| 数据抽象 | 所有数据操作封装在 Pinia Store，主进程换实现不影响 UI |
| IPC 预埋 | preload 暴露完整 API，日后加功能不需重构桥接层 |
| 锁并发 | store 操作串行化（Promise 链锁），防 Electron IPC 并发回写 |

### 1.2 窗口体系

```
系统托盘（唯一固定存在，蓝点指示穿透状态）
    └── 右键菜单：全部/分类/新建/穿透/迷你卡片/贴边收纳/快捷键/退出

云游列表窗口（BrowserWindow, frameless, transparent, alwaysOnTop）
    ├── 默认显示全部便签，高度自适应内容（ResizeObserver）
    ├── 点击卡片 → 编辑浮层
    ├── 拖拽文件到卡片 → 添加附件
    └── 设置面板（Teleport）替代工具栏控件

边缘吸附系统（EdgeDockController 独立模块）
    ├── NORMAL → DOCKED → HIDDEN 状态机
    └── 50ms 轮询 + renderer mouseout IPC 双通道
```

### 1.3 技术栈

| 层次 | 技术 |
|---|---|
| 框架 | Electron 33 + Vue 3 (Vite 构建) |
| 状态管理 | Pinia |
| 数据持久化 | electron-store (JSON, 加密) |
| UI | 原生 CSS (CSS 变量主题系统) |
| 图标 | lucide-vue-next |
| 打包 | electron-builder → NSIS 安装向导（asar 禁用） |
| 语言 | JavaScript（.vue SFC） |

### 1.4 项目结构

```
bianqian-electron/
├── SPEC.md                    # 功能规格（本文档）
├── DESIGN.md                  # 架构设计文档
├── package.json
├── electron.vite.config.js
├── src/
│   ├── main/                  # 主进程
│   │   ├── index.js           # 入口：单实例锁、窗口创建、托盘、IPC
│   │   ├── window-manager.js  # 窗口生命周期、穿透、透明、交互状态
│   │   ├── edge-dock.js       # 边缘吸附控制器（状态机 + 动画）
│   │   ├── tray.js            # 托盘图标（蓝点状态指示器）+ 菜单
│   │   ├── shortcuts.js       # 快捷键注册/录制/验证
│   │   ├── store.js           # electron-store 封装（加密、默认值合并）
│   │   ├── ipc.js             # ipcMain.handle/on 处理器（含附件锁并发）
│   │   └── categories.js      # 分类常量 + normalize
│   ├── preload/
│   │   └── index.js           # contextBridge + 全局拖拽事件兜底
│   └── renderer/              # Vue 3 渲染进程
│       ├── index.html
│       └── src/
│           ├── main.js
│           ├── App.vue         # 主界面（设置面板、编辑器、尺寸自适应）
│           ├── components/
│           │   ├── ShortcutEditor.vue     # 快捷键录制编辑器
│           │   └── AttachmentPopover.vue  # 附件弹出面板（#popover-root 隔离层）
│           ├── stores/notes.js            # Pinia（IPC 主路径 + localStorage 回退）
│           └── assets/styles/
│               ├── variables.css
│               └── global.css
└── resources/                 # 图标等资源
```

---

## 二、功能规格

### 2.1 系统托盘

**入口：** 应用启动时创建，退出时销毁

**左键：** 切换显示/隐藏云游窗口

**图标：** 默认便签图标；穿透模式时右侧叠加蓝色圆点 + tooltip 变为「便签 - 鼠标穿透中」；支持 PNG 资源文件回退到内嵌 SVG

**右键菜单：**

| 菜单项 | 行为 |
|---|---|
| 全部便签 | 显示窗口（筛选"全部"），含计数 |
| 分类 → | 子菜单：工作/生活/学习/会议/其他（含计数） |
| 新建便签 | 弹出空白编辑器 |
| 鼠标穿透 | checkbox，切换硬穿透模式 |
| 迷你卡片 | checkbox，切换迷你/列表模式 |
| 贴边收纳 | checkbox，开启/关闭边缘自动隐藏 |
| 快捷键设置 | 打开快捷键录制窗口 |
| 退出 | app.exit(0) |

### 2.2 云游列表窗口

**窗口属性：**
- `frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true`
- 正常模式：280×360px 初始，minWidth 260, minHeight 200
- 迷你模式：220×~120px，minWidth 200, minHeight 80
- 默认靠屏幕右上角
- 可调整大小（`resizable: true`），支持多显示器 workArea 约束

**关闭行为：** 隐藏而非销毁，下次显示复用

**高度自适应：**
- ResizeObserver 监听 app-shell 尺寸变化
- mini 模式：计算 header(隐藏) + drag-bar + 最多3张卡片 + 间距
- 列表模式：>3 条时随内容扩展，≤3 条保持最小高度
- 通过 IPC `resize-to-content` 通知主进程调整窗口

**鼠标穿透（硬穿透）：**
- 默认关闭，窗口保持可交互
- 通过托盘菜单「鼠标穿透」或快捷键开启/关闭
- 穿透模式开启时：窗口完全忽略鼠标
- 托盘图标显示蓝点状态指示

### 2.3 边缘吸附系统（EdgeDockController）

**架构：** 独立控制器类，window-manager 通过回调委托

**状态机：**
```
NORMAL ↔ DOCKED_LEFT ↔ HIDDEN_LEFT
NORMAL ↔ DOCKED_RIGHT ↔ HIDDEN_RIGHT
```

**吸附：** `moved` 事件 → 80ms 去抖 → 检测屏幕边缘 20px → setBounds 贴边

**隐藏：** 两种触发通道
- 主进程 50ms 轮询 → 鼠标离开窗口 → 500ms 延迟 → cubic ease-out 滑出（4px 露出）
- Renderer `document.mouseout`(relatedTarget=null) → IPC `mouse-leave` → 同上

**唤出：** 主进程 50ms 轮询 → 鼠标碰屏幕边缘（4px 触发区）→ cubic ease-out 滑入

**保护：**
- `isPinned`：置顶状态禁止隐藏
- `isEditing`：编辑器打开时禁止隐藏
- 动画中禁止重入

**多显示器：** `screen.getDisplayMatching(bounds).workArea` 动态获取

### 2.4 便签列表

**排序：** 置顶优先 → `order` 字段升序（默认 Date.now()，可通过拖动排序重排）

**列表项（便签卡片）：**

```
┌──────────────────────────────┐
│ [○] [📌] 标题文字      09:00  │  ← row1: 复选框 + 置顶 + 标题 + 时间
│ 备注内容预览，两行截断…       │  ← row2: 内容（v-if 有内容时显示）
│ [工作]           📎 2个附件  │  ← row3: 分类标签 + 附件数
└──────────────────────────────┘
```

**交互：**
| 元素 | 行为 |
|---|---|
| 复选框 ○/✓ | 点击切换 completed，不冒泡 |
| 置顶按钮 📌 | 悬停显示，点击切换 pinned |
| 整卡（除复选框/置顶） | 点击打开编辑器浮层 |
| 拖拽文件到卡片 | 高亮卡片 → 导入附件（去重、上限10、清理未用） |
| 完成状态 | 卡片降低透明度，标题加删除线 |

### 2.5 编辑器浮层

**触发：** 点击任意便签卡片

**外观：** 全屏半透明遮罩 + 中央白色面板，圆角12px

**字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| 标题 | text input | 必填，回车保存 |
| 日期 | date input | 格式 YYYY-MM-DD，默认当天 |
| 时间 | time input | 格式 HH:MM，默认 09:00 |
| 分类 | select | 工作/生活/学习/会议/其他 |
| 提醒 | checkbox | 默认开启 |
| 备注 | textarea | 可多行，自动滚动 |
| 附件 | 按钮 | 触发系统文件选择（多选，上限10），UUID 命名 |

**操作：**
- 保存：验证标题非空 → 清理未用附件副本 → 关闭
- 取消：回退到原始附件列表 → 清理未用副本 → 关闭
- 删除：仅已有便签显示，点击确认后删除

### 2.6 设置面板

**触发：** 点击 header 区域「⚙ 设置」按钮（mini 模式下禁用）

**外观：** Teleport 到 #popover-root，从按钮右下角弹出，252px 宽，多级导航

**主面板：**
- 透明度滑杆（35%-100%，步长 5%）
- 分类筛选 → 子面板
- 窗口模式 → 子面板
- 当前状态：鼠标穿透、贴边收纳（只读）

**分类筛选子面板：** 全部/工作/生活/学习/会议/其他（含计数）

**窗口模式子面板：**
- 列表模式 / 迷你模式
- 预设：常规(92%) / 专注(100%) / 会议(72%+穿透) / 极简(48%+迷你)

**关闭：** 点击面板外 / 按 Esc / 切换模式导致窗口变为 mini

### 2.7 工具栏（仅列表模式）

**搜索框：** 支持标题+内容关键词实时过滤 + 回车自然语言快速创建

**自然语言解析：**
- `#分类` → 设置分类
- `明天/后天` → 自动计算日期
- `上午/下午/晚上 N点/N:M` → 解析时间
- 示例：`明天9点交报告 #工作` → 标题"交报告"，明天9:00，分类"工作"

### 2.8 快捷键

| 快捷键 | 位置 | 行为 |
|---|---|---|
| F3 | 全局 | 切换窗口显示/隐藏 |
| Escape | 窗口内 | 隐藏窗口（或关闭设置/附件弹窗） |
| Ctrl+Shift+P | 全局 | 切换穿透模式 |
| Alt+1~6 | 窗口内 | 快捷切换分类 |

**快捷键配置面板：**
- 托盘菜单 → 340×420 子窗口（frameless, parent: 主窗口）
- 录制中释放全局快捷键 → before-input-event 捕获
- 冲突检测：无冲突自动清除；注册失败保留旧快捷键并提示
- 「恢复默认」→ 全部注册成功才返回 ok

### 2.9 提醒系统

**检查频率：** 每 60 秒 + 窗口获得焦点/visibility 恢复时

**触发条件：** 到期时间已过且未完成、已提醒

**提示方式：** Web Notifications API，去重用 reminderHistory Set

### 2.10 数据模型

```javascript
{
  id:          String,   // UUID (crypto.randomUUID)
  title:       String,   // 必填
  content:     String,   // 备注
  category:    String,   // '工作'|'生活'|'学习'|'会议'|'其他'
  date:        String,   // 'YYYY-MM-DD'
  time:        String,   // 'HH:MM'
  completed:   Boolean,  // 默认 false
  pinned:      Boolean,  // 默认 false
  remind:      Boolean,  // 默认 true
  attachments: String[], // UUID 命名的附件路径（上限10）
  order:       Number,   // 排序权重，默认 Date.now()，拖动排序自动更新
  createdAt:   String    // ISO 时间戳
}
```

**存储：** `electron-store`（加密 key `bianqian-electron-store-v1`）→ `便签数据.json`

**回退：** 无 IPC 时使用 localStorage

### 2.11 附件系统

**选择：** 系统文件对话框（可关联父窗口），多选，上限10

**复制：** UUID 命名 → `userData/attachments/`，防原文件变动失效

**路径校验：** 只有 `isAttachmentPath()` 校验通过才允许通过 IPC 打开，防止任意路径访问

**去重：** Set 去重 + `normalizeAttachments`

**清理：**
- 保存时：比较原始附件和最终附件，删除未引用副本
- 删除便签时：`cleanOrphanAttachments` 扫描全部便签，移除无主附件
- 编辑器取消：回退到原始附件列表

**拖拽导入：**
- 卡片上拖拽：dragOver 高亮 → drop 导入到该便签
- 全局拖拽：preload 通过 `window.postMessage` 传递路径 → renderer 查找卡片 → 导入
- 文件路径通过 `webUtils.getPathForFile` 获取

**Popover：** Teleport 到 `#popover-root` 隔离层，`position: absolute` + rAF 追踪锚点

### 2.12 右键上下文菜单

**菜单项：** 编辑 / 置顶/取消置顶 / 标记完成/取消完成 / 删除

**外观：** Teletport 到 #popover-root，毛玻璃暗色主题，position:absolute

### 2.13 卡片拖动排序

**触发：** 卡片上 `mousedown`（非 mini 模式、左键、非按钮区域）

**交互流程：**
1. mousedown 记录起始坐标和卡片尺寸（高度、间距）
2. 移动超过 5px 阈值 → 激活排序模式
3. mousemove：计算 deltaY → 按卡片步长计算移位数量 → 被跨越的卡片 translateY 让位
4. 拖拽中卡片阴影上浮（`sort-dragging` class：`box-shadow` + `z-index: 100`）
5. mouseup：计算目标索引 → `reorderNote(fromId, toId, 'before'|'after')`
6. 排序完成 → `sortDragJustEnded` 保护 100ms，防止误触发编辑器

**数据持久化：**
- `reorderNote` 在 Pinia 本地 splice 后，批量 IPC 更新每条受影响便签的 `order` 字段
- `order` 默认值为 `Date.now()`（新建时），排序改为 `a.order - b.order` 替代之前的日期排序
- 拖动期间 `skipNextResize = true` 抑制 ResizeObserver 导致的窗口抖动

**约束：** mini 模式禁用；按钮区域（复选框、置顶）不触发拖动

### 2.14 构建配置

**打包工具：** electron-builder + NSIS

**关键配置：**
- `"asar": false`：避免 ASAR 损坏 electron.exe 二进制
- `"sandbox": false`：子窗口（快捷键编辑器）preload ES module 加载
- NSIS 非一键安装、可选目录、桌面/开始菜单快捷方式

---

## 三、可扩展性设计

| 设计点 | 当前实现 | 日后扩展方向 |
|---|---|---|
| CSS 变量 | `--accent`, `--bg-card` 等 | 换肤：夜间模式/主题色 |
| Pinia Store | `notes.js` 封装所有数据操作 | 加云同步：替换 action 内部为 API 调用 |
| IPC 桥接 | preload 暴露完整 `window.api` | 加功能：只需在 ipc.js 添加新的 handle |
| 附着系统 | EdgeDockController 独立类 | 加顶部/底部吸附只需扩展 checkSnap |
| 穿透机制 | `_setClickThrough()` 封装 | 换实现只需改 window-manager.js |
| 快捷键 | 动态注册 + electron-store 配置 | 新增快捷功能只需加一个 ID + 默认绑定 |
| 附件交互 | Popover 面板 + 拖拽 | 加缩略图预览只需改 AttachmentPopover |
| 设置面板 | 多级导航 Teleport | 加更多配置项只需添加入口 + 子面板 |

---

## 四、已实现

- [x] 无主窗口架构（云游窗口 + 托盘）
- [x] 便签列表（分类筛选、搜索、置顶排序）
- [x] 新建/编辑/删除便签
- [x] 复选框完成状态
- [x] 分类标签（工作/生活/学习/会议/其他，含计数）
- [x] 附件系统（UUID 命名、路径校验、去重、去孤清理、锁并发）
- [x] 提醒检查 + Web Notifications（去重）
- [x] 系统托盘（蓝点状态指示、PNG 回退、左键切换/右键菜单）
- [x] 鼠标硬穿透（托盘/快捷键显式开启）
- [x] 设置面板（透明度/分类/模式/预设，多级导航 Teleport）
- [x] 窗口高度自适应内容（ResizeObserver + IPC）
- [x] 迷你卡片模式（隐藏 header/拖拽栏、最多3条）
- [x] 自然语言快速创建（搜索框回车）
- [x] F3/Ctrl+Shift+P 全局快捷键
- [x] NSIS 安装向导打包
- [x] electron-builder 二进制损坏修复（asar: false）
- [x] 附件 Popover（#popover-root 隔离层、rAF 追踪锚点）
- [x] 文件拖拽导入（卡片级 + 全局级两种通道，去重防抖）
- [x] 卡片拖动排序（mousedown 追踪，5px 阈值，translateY 让位，order 字段持久化）
- [x] 快捷键配置面板（录制/保存/重置/冲突检测）
- [x] 边缘吸附系统（EdgeDockController 状态机，始终开启）
- [x] 贴边收纳（托盘开关，独立控制，编辑保护）
- [x] 右键上下文菜单（编辑/置顶/完成/删除）
- [x] 单实例锁（第二个实例激活已有窗口）
- [x] 多显示器 workArea 约束
- [x] 圆角裁切修复（clip-path + backdrop-filter 合成层处理）

## 五、待实现

- [ ] 应用图标
- [ ] Windows 原生 Toast 通知
- [ ] 数据备份/导出（JSON / CSV）
- [ ] 多个独立便签窗口
- [ ] 云同步
- [ ] 重复任务
- [ ] 统计看板
