# 快捷键系统 — 设计文档

> Date: 2026-05-24 | Status: approved

## Goal

穿透模式增加快捷键切换，并提供统一的快捷键配置窗口，支持用户自定义所有快捷键绑定。

## Current State

- `shortcuts.js`: F3 切换窗口、Escape 隐藏、Alt+1~9 分类切换，全部硬编码
- 穿透模式只能通过托盘菜单 checkbox 和窗口内按钮切换
- 无快捷键持久化，无自定义能力

## Design

### 新增穿透快捷键

默认 `Ctrl+Shift+P` 切换穿透模式，与其他快捷键一样可自定义。

### 快捷键配置窗口

托盘菜单新增「快捷键设置」→ 打开独立 BrowserWindow（340×420，frameless，非 alwaysOnTop）。

**窗口布局：**

```
快捷键设置                    ✕
─────────────────────────────
  功能              快捷键
─────────────────────────────
  切换窗口显示       F3      ✏
  隐藏窗口           Escape  ✏
  穿透模式           Ctrl+   ✏
                    Shift+P
  ─────────────────────────
  分类 — 全部       Alt+1   ✏
  分类 — 工作       Alt+2   ✏
  分类 — 生活       Alt+3   ✏
  分类 — 学习       Alt+4   ✏
  分类 — 会议       Alt+5   ✏
  分类 — 其他       Alt+6   ✏
─────────────────────────────
                    [恢复默认]
```

### 交互

| 操作 | 行为 |
|------|------|
| 点击 ✏ | 该行进入录制模式，显示闪烁"按下组合键..." |
| 按下新组合 | 保存新快捷键，退出录制 |
| 录制中按 Esc | 取消录制，保持原快捷键 |
| 录制中按已被占用的组合 | 弹出确认提示 → 确认后替换，旧功能快捷键清空 |
| 恢复默认 | 所有快捷键回到初始值 |

### 数据模型

```javascript
// electron-store settings.shortcuts
{
  "toggle-window": "F3",
  "hide-window": "Escape",
  "toggle-passthrough": "Ctrl+Shift+P",
  "category-全部": "Alt+1",
  "category-工作": "Alt+2",
  "category-生活": "Alt+3",
  "category-学习": "Alt+4",
  "category-会议": "Alt+5",
  "category-其他": "Alt+6"
}
```

快捷键的序列化格式：`Ctrl+Shift+P`（用 `+` 连接修饰键和主键，顺序：Ctrl > Alt > Shift > Meta > Key）。

### IPC 接口

```
shortcuts:list         → 返回当前快捷键配置对象
shortcuts:update       → 更新某个快捷键 (id, newBinding) → 返回 { ok, conflict? }
shortcuts:reset        → 恢复默认
```

### 主进程改动

**shortcuts.js 重构：**
- `registerShortcuts(windowManager, store)` — 从 store 读取 shortcuts 配置，批量注册
- `reregisterShortcut(id, newBinding)` — 注销旧快捷键 + 注册新快捷键
- 现有 F3/Escape/Alt+1~9 行为不变，仅改为从配置读取

**tray.js：**
- 菜单 "退出" 前插入 "快捷键设置"，调用 `windowManager.openShortcutEditor()`

**window-manager.js：**
- `openShortcutEditor()` — 创建配置窗口（BrowserWindow, 340×420, frameless, parent=主窗口）

### 渲染进程

**新建文件：**
- `src/renderer/src/components/ShortcutEditor.vue` — 快捷键编辑器组件

**App.vue 改动：**
- 在模板顶部添加 `v-if` 判断：若 `window.location.hash === '#shortcut-editor'`，渲染 `<ShortcutEditor />` 而非 `<main class="app-shell">`
- 无需独立 HTML 入口或额外构建配置

**preload：**
- 新增 `api.shortcuts` 命名空间：`list()`, `update(id, binding)`, `reset()`

### 默认快捷键

| ID | 功能 | 默认快捷键 |
|----|------|-----------|
| toggle-window | 切换窗口显示 | F3 |
| hide-window | 隐藏窗口 | Escape |
| toggle-passthrough | 穿透模式 | Ctrl+Shift+P |
| category-全部 | 分类 — 全部 | Alt+1 |
| category-工作 | 分类 — 工作 | Alt+2 |
| category-生活 | 分类 — 生活 | Alt+3 |
| category-学习 | 分类 — 学习 | Alt+4 |
| category-会议 | 分类 — 会议 | Alt+5 |
| category-其他 | 分类 — 其他 | Alt+6 |

## Files Changed

| File | Change |
|------|--------|
| `src/main/shortcuts.js` | 重构：动态注册/注销，从 store 读取配置 |
| `src/main/store.js` | settings 新增 shortcuts 默认值 |
| `src/main/tray.js` | 托盘菜单 +「快捷键设置」项 |
| `src/main/ipc.js` | 新增 shortcuts IPC 处理器 |
| `src/preload/index.js` | 新增 api.shortcuts |
| `src/main/window-manager.js` | 新增 openShortcutEditor() |
| `src/renderer/src/components/ShortcutEditor.vue` | 新建：快捷键编辑器组件 |
| `src/renderer/src/App.vue` | hash 路由判断 + ShortcutEditor 渲染 |

## Not In Scope

- 鼠标按键绑定
- 快捷键组合录制的修饰键顺序自定义
- 导入/导出快捷键配置
- 多语言支持
