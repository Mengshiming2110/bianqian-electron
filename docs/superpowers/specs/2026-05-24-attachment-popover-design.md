# 附件 Popover 交互改进 — 设计文档

> Date: 2026-05-24 | Status: approved

## Goal

便签卡片附件区域从静态计数变为可交互入口：点击 📎 pill 弹出附件面板，支持查看/打开/删除/拖拽添加。

## Current State

卡片附件区域 (`App.vue:84-87`) 只显示 `📎 N 个附件`，无交互。编辑器内已有附件 chip 交互（文件名展示 + 点击打开 + X 删除），但卡片上完全不可操作。

## Design

### AttachmentPopover 组件（新增）

```
src/renderer/src/components/AttachmentPopover.vue
```

**Props**
| Prop | Type | Description |
|------|------|-------------|
| attachments | String[] | 文件路径列表 |
| anchorEl | HTMLElement\|null | 卡片上 📎 pill DOM 元素，用于计算弹出位置 |
| visible | Boolean | 是否显示 |

**Emits**
| Event | Payload | Description |
|-------|---------|-------------|
| close | — | 关闭面板 |
| add | `string[]` | 新拖入/选择的文件路径 |
| remove | `string` | 删除的文件路径 |
| open | `string` | 点击打开的文件路径 |

### 定位

```
pillRect = anchorEl.getBoundingClientRect()
popover.top  = pillRect.bottom + 4px
popover.left = pillRect.right - 200px   // 200px = popover width, 右对齐
// 下方空间不足则翻到上方: popover.top = pillRect.top - popoverHeight - 4px
```

`<Teleport to="body">` + `position: fixed`，z-index 高于编辑器遮罩层（>1000）。

### 动画

```css
@keyframes popIn {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
transform-origin: top right;
animation-duration: 180ms;
```

关闭时反向播放。

### 布局

```
┌──────────────────────┐
│ 📎 附件 (3)       ✕  │  ← 顶栏（与 pill 同色 accent 背景）
│──────────────────────│
│ 📄 需求文档.docx  ✕  │  ← 文件行（emoji + 文件名截断 + 删除X）
│ 🖼 截图.png       ✕  │     整行 hover 显底色，点击文件名 = open
│ 📊 数据.xlsx      ✕  │
│──────────────────────│
│ + 添加附件           │  ← 按钮（调起系统文件选择器）
└──────────────────────┘
  宽度: 200px
  最大高度: 280px，超出滚动
```

- 整个 popover 为拖拽热区（drop 事件直接处理，无 UI 提示）
- 文件行无背景框，hover 才显底色
- 文件名 click → emit('open', path) → shell.openPath()
- 文件名右侧 ✕ → emit('remove', path)
- 底部按钮 → dialog.showOpenDialog({ multiSelections: true })

### 卡片改动

`App.vue` 卡片模板：

**Before:**
```html
<span v-if="note.attachments.length" class="attachment-count">
  <Paperclip :size="13" />
  {{ note.attachments.length }} 个附件
</span>
```

**After:**
```html
<span v-if="note.attachments.length"
      ref="attachPill"
      class="attach-pill"
      @click.stop="openAttachPopover(note, $el)">
  <Paperclip :size="12" />
  {{ note.attachments.length }}
</span>
```

### 数据流

```
拖入文件 → drop → file.path[] → emit('add', paths)
  → App.vue: notes.update(id, { attachments: [...old, ...paths] })
  → IPC: api.notes.update() → electron-store 持久化

点击打开 → emit('open', path) → api.files.openPath(path)
  → IPC: shell.openPath(path)

删除 → emit('remove', path) → notes.update(id, { attachments: filtered })
```

### 状态管理

`App.vue` 新增：
```javascript
const attachPopover = reactive({
  visible: false,
  note: null,       // 当前便签对象
  anchorEl: null    // 卡片上 pill 元素的引用
})
```

同时只能打开一个 popover。点击另一个卡片的 pill 时先关闭当前。

### 关闭方式

1. 点击 ✕ 按钮
2. 点击 popover 外部（全局 click listener）
3. 按 Esc 键

## Not In Scope

- 面板内文件拖拽排序
- 文件缩略图/类型预览
- 多个卡片同时展开多个 popover

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/AttachmentPopover.vue` | 新建 |
| `src/renderer/src/App.vue` | 卡片附件区域改造 + popover 状态管理 |
| `src/renderer/src/stores/notes.js` | 无需改动（已有 chooseAttachments / openAttachment） |

## Interaction Matrix

| 操作 | 触发方式 | 响应 |
|------|---------|------|
| 打开面板 | 点击卡片 📎 pill | scale 弹出，右对齐 pill |
| 查看文件 | 面板内查看文件列表 | 文件名 + emoji 图标 |
| 打开文件 | 点击文件名 | shell.openPath() |
| 删除附件 | 点击 ✕ | 从 attachments 移除，面板内文件行消失 |
| 按钮添加 | 点击 + 添加附件 | 系统文件选择器（多选）→ 追加 |
| 拖拽添加 | 拖文件到面板任意位置 | drop → 获取 path → 追加 |
| 关闭面板 | ✕ / 外部点击 / Esc | scale(0) 动画 → 移除 |
