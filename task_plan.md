# Task Plan: 便签功能迭代

## Current Phase
Phase 4 — 功能实测与打包完成

## Feature 1: 附件 Popover 交互

**Goal:** 便签卡片附件区域从静态计数变为可点击 pill，弹出面板查看/打开/删除/拖拽添加。

**Status:** ✅ 实现完成

### Phases
| Phase | Status |
|-------|--------|
| Phase 1: Requirements & Discovery | ✅ done |
| Phase 2: Planning & Structure | ✅ done |
| Phase 3: Implementation | ✅ done |
| Phase 4: Testing & Verification | in_progress |
| Packaging: NSIS installer | ✅ done |

### Key Decisions
| Decision | Rationale |
|----------|-----------|
| v-for key: `${file}-${index}` | 避免同路径文件 key 冲突 |
| recalcKey + requestAnimationFrame | scroll/resize 时 popover 不偏移 |
| 高度估算简化为 maxHeight | 避免 magic number 与 CSS 耦合 |
| $event.currentTarget | 点击子元素也能获取正确的 pill 元素 |
| 坐标值 props 代替 DOM 引用 | 避免 getBoundingClientRect 跨组件问题 |
| 外 anchor div + 内 animated div | CSS transform 不破坏 position:fixed |

### Errors Encountered
| Error | Resolution |
|-------|------------|
| $event.target 误传 SVG 子元素 → popover 位置偏移 | 改用 $event.currentTarget |
| CSS transform 创建 containing block → position:fixed 失效 | 外 div 纯定位，内 div 做动画 |
| scroll 事件高频触发 → popover 抖动 | requestAnimationFrame 节流 + 可见时才重算 |
| Teleport to="body" 可能无效 | 改用 Teleport to="#popover-root"，在 index.html 新增容器 |

---

## Feature 2: 快捷键系统

**Goal:** 穿透模式增加 Ctrl+Shift+P 快捷键，托盘菜单入口打开可自定义快捷键配置窗口。

**Status:** ✅ 实现完成

### Key Decisions
| Decision | Rationale |
|----------|-----------|
| 全局快捷键 Ctrl+Shift+P | 穿透模式在窗口隐藏时也需可切换 |
| 独立 BrowserWindow 配置面板 | 托盘入口，frameless 340×420 |
| hash 路由 (#shortcut-editor) | 复用渲染进程，无需额外构建配置 |
| electron-store 持久化 shortcuts | 与现有 settings 一致，JSON 可编辑 |
| 录制模式 + 冲突自动清理 | UI 简单直观 |

### Errors Encountered
| Error | Resolution |
|-------|------------|
| 快捷键列表空白 | getSettings() 在无已存数据时跳过 defaults → 添加 DEFAULT_SHORTCUTS 回退 |
| DEFAULT_SHORTCUTS 重复声明 | 合并为一份，放在文件顶部 |
| 关闭按钮调用 window:hide 误关主窗口 | 改为 window.close() 关闭当前快捷键窗口 |

---

## Files Summary

### Feature 1 (Attachment Popover)
| File | Change |
|------|--------|
| `src/renderer/src/components/AttachmentPopover.vue` | 新建 |
| `src/renderer/src/App.vue` | 改造卡片附件区域 + popover 集成 |
| `src/renderer/index.html` | 新增 #popover-root div |

### Feature 2 (Shortcut System)
| File | Change |
|------|--------|
| `src/main/store.js` | shortcuts 默认值 + helpers |
| `src/main/shortcuts.js` | 重构为动态注册 |
| `src/main/ipc.js` | shortcuts IPC handlers |
| `src/main/tray.js` | 托盘菜单 + 快捷键设置 |
| `src/main/window-manager.js` | openShortcutEditor() |
| `src/preload/index.js` | api.shortcuts |
| `src/main/index.js` | 适配 registerAllShortcuts |
| `src/renderer/src/components/ShortcutEditor.vue` | 新建 |
| `src/renderer/src/App.vue` | hash 路由 |
