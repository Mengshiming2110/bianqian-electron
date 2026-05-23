# 便签 Electron 版 — 功能规格文档

> 本文档是开发的唯一事实来源。每个功能必须有对应的 SPEC 条目。
> 日期：2026-05-24

---

## 一、架构概览

### 1.1 设计原则

| 原则 | 说明 |
|---|---|
| 无主窗口 | 便签完全通过云游窗口 + 系统托盘操作，无固定主界面 |
| 模块分离 | main/renderer/preload 三层清晰隔离 |
| 数据抽象 | 所有数据操作封装在 Pinia Store，主进程换实现不影响 UI |
| IPC 预埋 | preload 暴露完整 API，日后加功能不需重构桥接层 |

### 1.2 窗口体系

```
系统托盘（唯一固定存在）
    └── 右键菜单：全部/分类/新建/退出 + 鼠标穿透开关

云游列表窗口（BrowserWindow, frameless, transparent, alwaysOnTop）
    ├── 默认显示全部便签
    ├── 点击卡片 → 编辑浮层
    ├── 点击复选框 → 切换完成状态
    ├── 默认开启鼠标穿透（硬穿透，不接收点击也不接收悬停）
    ├── 悬停 200ms 激活交互
    └── 移出 1.5s 恢复穿透

编辑浮层（渲染进程内 overlay，非独立窗口）
    └── 保存/取消后自动关闭，卡片列表同步刷新
```

### 1.3 技术栈

| 层次 | 技术 |
|---|---|
| 框架 | Electron 33 + Vue 3 (Vite 构建) |
| 状态管理 | Pinia |
| 数据持久化 | electron-store (JSON) |
| UI | 原生 CSS (CSS 变量主题系统) |
| 图标 | lucide-vue-next |
| 打包 | electron-builder → NSIS 安装向导（asar 禁用） |
| 语言 | JavaScript（.vue SFC） |

### 1.4 项目结构

```
bianqian-electron/
├── SPEC.md                    # 本文档
├── package.json
├── electron.vite.config.js
├── src/
│   ├── main/                  # 主进程
│   │   ├── index.js           # 入口：app.on("ready")、窗口创建
│   │   ├── window-manager.js  # 窗口管理、穿透配置
│   │   ├── tray.js            # 托盘 + 菜单
│   │   ├── shortcuts.js       # F3/Esc/Alt+1~9
│   │   ├── store.js           # electron-store 封装
│   │   ├── ipc.js             # ipcMain.handle 处理器
│   │   └── categories.js      # 分类常量
│   ├── preload/
│   │   └── index.js           # contextBridge 安全桥接
│   └── renderer/              # Vue 3 渲染进程
│       ├── index.html
│       └── src/
│           ├── main.js
│           ├── App.vue
│           ├── stores/notes.js   # Pinia 便签状态
│           └── assets/styles/
│               ├── variables.css
│               └── global.css
└── resources/                 # 图标等资源（构建时用）
```

---

## 二、功能规格

### 2.1 系统托盘

**入口：** 应用启动时创建，退出时销毁

**左键：** 切换显示/隐藏云游窗口

**右键菜单：**

| 菜单项 | 行为 |
|---|---|
| 全部便签 | 显示云游窗口（筛选"全部"） |
| 分类 → | 子菜单：工作/生活/学习/会议/其他（含计数） |
| 新建便签 | 弹出空白编辑器 |
| 鼠标穿透 | checkbox，切换硬穿透模式 |
| 退出 | app.exit(0) |

**扩展预留：** `rebuildMenu(noteCountByCat)` 接受分类计数，托盘菜单动态显示数量。

---

### 2.2 云游列表窗口

**窗口属性：**
- `frame: false, transparent: true, alwaysOnTop: true`
- 尺寸：280×500px，默认靠屏幕右上角
- 可调整大小（`resizable: true`）
- 透明度可调（35%-100%，默认 92%）

**关闭行为：** 隐藏而非销毁，下次显示复用

**鼠标穿透（硬穿透）：**
- 默认开启：`setIgnoreMouseEvents(true, { forward: true })`，鼠标事件穿透到下层窗口，不接收点击也不转发悬停信息
- 穿透模式（托盘菜单开启）：`setIgnoreMouseEvents(true)` 无 forward，完全忽略鼠标
- 鼠标进入窗口区域 200ms 后：关闭穿透，窗口可交互
- 鼠标离开 1.5s：恢复穿透
- 穿透开启时界面按钮/卡片/tooltip 均不响应

---

### 2.3 便签列表

**渲染方式：** CSS `overflow-y: auto` 滚动

**列表项（便签卡片）：**

```
┌──────────────────────────────┐
│ [○] 标题文字          09:00  │  ← row1: 复选框 + 标题 + 时间
│ 备注内容预览，两行截断…       │  ← row2: 内容（最多2行）
│ [工作]           📎 2个附件  │  ← row3: 分类标签 + 附件数
└──────────────────────────────┘
```

**交互：**
| 元素 | 行为 |
|---|---|
| 复选框 ○/✓ | 点击切换 completed，不冒泡 |
| 整卡（除复选框） | 点击打开编辑器浮层 |
| 完成状态 | 卡片降低透明度，标题加删除线 |
| 悬停 | 背景变亮，边框高亮 accent 色 |

---

### 2.4 编辑器浮层

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
| 附件 | 按钮 | 触发系统文件选择（多选），显示文件名列表，点击打开 |

**操作：**
- 保存：验证标题非空 → 更新 store → 关闭浮层
- 取消：直接关闭浮层，不保存
- 删除：仅已有便签显示，点击确认后删除

---

### 2.5 工具栏

**搜索框：** 支持标题+内容关键词实时过滤

**透明度滑杆：**
- 范围：35% - 100%（步长 5%）
- 默认 92%
- 穿透开启时滑杆本身也不接收鼠标，需从托盘关闭穿透后再调整

**分类标签：**
- 全部 / 工作 / 生活 / 学习 / 会议 / 其他
- 每个标签旁显示该分类的便签数量
- 网格布局（3列）

---

### 2.6 快捷键

| 快捷键 | 位置 | 行为 |
|---|---|---|
| F3 | 全局 | 切换云游窗口显示/隐藏 |
| Escape | 云游窗口内 | 隐藏云游窗口 |
| Alt+1~9 | 云游窗口内 | 快捷切换分类（预留） |

---

### 2.7 提醒系统

**检查频率：** 每 60 秒一次

**触发条件：** `-120 <= (提醒时间 - 当前时间) <= 0`（过去 2 分钟内的提醒）

**提示方式：** Web Notifications API

**注意：** 当前实现为客户端轮询，日后可改为 Windows Toast API

---

### 2.8 数据模型

```javascript
// 便签条目
{
  id:          String,   // Date.now().toString()
  title:       String,   // 必填
  content:     String,   // 备注，可为空
  category:    String,   // '工作'|'生活'|'学习'|'会议'|'其他'
  date:        String,   // 'YYYY-MM-DD'
  time:        String,   // 'HH:MM'
  completed:   Boolean,  // 默认 false
  remind:      Boolean,  // 默认 true
  attachments: String[], // 文件路径数组
  createdAt:   String    // ISO 时间戳
}
```

**存储：** `electron-store` → `便签数据.json`

---

### 2.9 构建配置

**打包工具：** electron-builder + NSIS

**已知问题与修复：**
- `updating asar integrity executable resource` 步骤会损坏 electron.exe，导致启动报 SxS 错误
- **修复方案：** `"asar": false`，跳过 ASAR 打包避免二进制被修改
- **副作用：** 安装包体积增大（node_modules 以目录形式包含），需确保资源文件完整性

**NSIS 配置：**
- 非一键安装（用户可选安装目录）
- 创建桌面快捷方式和开始菜单快捷方式
- 快捷方式名称："便签"

---

## 三、可扩展性设计

| 设计点 | 当前实现 | 日后扩展方向 |
|---|---|---|
| CSS 变量 | `--accent`, `--bg-card` 等 | 换肤：夜间模式/主题色 |
| Pinia Store | `notes.js` 封装所有数据操作 | 加云同步：替换 action 内部为 API 调用 |
| IPC 桥接 | preload 暴露完整 `window.api` | 加功能：只需在 ipc.js 添加新的 handle |
| 提醒抽象 | `notifyReminder()` 单独函数 | 换 Windows Toast API 只需改这处 |
| 穿透机制 | `_setClickThrough()` 封装 | 换实现只需改 window-manager.js |

---

## 四、已实现

- [x] 无主窗口架构（云游窗口 + 托盘）
- [x] 便签列表（分类筛选、搜索）
- [x] 新建/编辑/删除便签
- [x] 复选框完成状态
- [x] 分类标签（工作/生活/学习/会议/其他，含计数）
- [x] 附件添加（系统文件选择）+ 点击打开
- [x] 提醒检查 + Web Notifications
- [x] 系统托盘（左键切换/右键菜单 + 鼠标穿透开关）
- [x] 鼠标硬穿透（默认转发穿透，穿透模式完全忽略）
- [x] 透明度滑杆（35%-100%，默认 92%）
- [x] F3 全局快捷键
- [x] NSIS 安装向导打包
- [x] electron-builder 二进制损坏修复（asar: false）

---

## 五、待实现（后续迭代）

- [ ] Windows 原生 Toast 通知（替代 Web Notifications）
- [ ] 数据备份/导出（JSON / CSV）
- [ ] 快捷键自定义
- [ ] 多个云游窗口（独立卡片模式）
- [ ] 云同步
- [ ] 重复任务
- [ ] 统计看板
- [ ] 应用图标
