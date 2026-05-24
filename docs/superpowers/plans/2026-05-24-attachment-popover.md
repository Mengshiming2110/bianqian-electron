# 附件 Popover 交互改进 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 便签卡片附件区域从静态计数变为可点击 pill，弹出 AttachmentPopover 面板支持查看/打开/删除/拖拽添加附件。

**Architecture:** 新建 `AttachmentPopover.vue` 组件通过 `<Teleport to="body">` 渲染到顶层，`position: fixed` + JS 手动计算位置实现右对齐 pill 锚点，`transform: scale` 动画处理弹出/收起。父组件 App.vue 管理 `attachPopover` 响应式状态，组件间通过 emit/props 通信。

**Tech Stack:** Vue 3 SFC, `<Teleport>`, CSS @keyframes, Electron native drag-and-drop, lucide-vue-next icons

---

### Task 1: Create AttachmentPopover component — template & props

**Files:**
- Create: `src/renderer/src/components/AttachmentPopover.vue`

- [ ] **Step 1: Create component file with template, props, and emits**

```vue
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="popoverRef"
      class="attach-popover"
      :class="{ closing: isClosing }"
      :style="popoverStyle"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="popover-header">
        <span>附件 ({{ attachments.length }})</span>
        <button class="popover-close" type="button" @click="closePanel">&#10005;</button>
      </div>

      <div class="popover-files">
        <div
          v-for="file in attachments"
          :key="file"
          class="popover-file-row"
        >
          <span class="file-emoji">📄</span>
          <span class="file-name" :title="file" @click="$emit('open', file)">{{ fileName(file) }}</span>
          <button class="file-remove" type="button" @click="$emit('remove', file)">&#10005;</button>
        </div>
      </div>

      <div class="popover-footer">
        <button class="popover-add-btn" type="button" @click="pickFiles">+ 添加附件</button>
      </div>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 2: Add script section with props, emits, and helper functions**

```vue
<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  anchorEl: { type: Object, default: null },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'add', 'remove', 'open'])

const isClosing = ref(false)
const dragOver = ref(false)
const popoverRef = ref(null)

function fileName(path) {
  return path.split(/[\\/]/).pop()
}

function closePanel() {
  isClosing.value = true
  setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, 150)
}

async function pickFiles() {
  const files = await window.api?.files.selectAttachments()
  if (files?.length) emit('add', files)
}

function onDragOver() {
  dragOver.value = true
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOver.value = false
  }
}

function onDrop(e) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  const paths = []
  for (const f of files) {
    if (f.path) paths.push(f.path)
  }
  if (paths.length) emit('add', paths)
}

const popoverStyle = computed(() => {
  if (!props.anchorEl) return { display: 'none' }
  const rect = props.anchorEl.getBoundingClientRect()
  const popoverWidth = 200
  const gap = 4
  const maxHeight = 280

  let top = rect.bottom + gap
  let left = rect.right - popoverWidth

  if (left < 8) left = 8
  if (left + popoverWidth > window.innerWidth - 8) {
    left = window.innerWidth - popoverWidth - 8
  }

  const estHeight = Math.min(40 + props.attachments.length * 24 + 36, maxHeight)
  if (top + estHeight > window.innerHeight - 8) {
    top = rect.top - estHeight - gap
  }

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${popoverWidth}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: 9999
  }
})
</script>
```

- [ ] **Step 3: Add scoped styles**

```css
<style scoped>
.attach-popover {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(47, 125, 120, 0.22);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(32, 44, 42, 0.18);
  backdrop-filter: blur(14px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: popIn 180ms ease-out;
  transform-origin: top right;
}

.attach-popover.closing {
  animation: popOut 150ms ease-in forwards;
}

@keyframes popIn {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

@keyframes popOut {
  from { transform: scale(1); opacity: 1; }
  to   { transform: scale(0); opacity: 0; }
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 9px;
  font-size: 11px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-bottom: 1px solid rgba(47, 125, 120, 0.1);
}

.popover-close {
  color: #bbb;
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
}

.popover-files {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 2px;
  min-height: 0;
}

.popover-file-row {
  display: flex;
  align-items: center;
  padding: 4px 5px;
  border-radius: 4px;
  font-size: 11px;
  gap: 5px;
}

.popover-file-row:hover {
  background: rgba(0, 0, 0, 0.03);
}

.file-emoji {
  font-size: 12px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text);
}

.file-name:hover {
  color: var(--accent);
}

.file-remove {
  color: #ccc;
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 10px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}

.file-remove:hover {
  color: var(--danger);
}

.popover-footer {
  border-top: 1px solid rgba(47, 125, 120, 0.07);
  padding: 5px 7px;
}

.popover-add-btn {
  width: 100%;
  border: 0;
  border-radius: 5px;
  padding: 5px;
  background: rgba(47, 125, 120, 0.08);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}

.popover-add-btn:hover {
  background: rgba(47, 125, 120, 0.15);
}

/* Electron drag-over visual feedback */
.attach-popover.drag-over {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
</style>
```

- [ ] **Step 4: Add drag-over class binding to template**

Edit the popover `<div>` to include the drag-over class:
```
class="attach-popover"
```
Change to:
```
class="attach-popover" :class="{ closing: isClosing, 'drag-over': dragOver }"
```

The `:class` binding already has `closing` — change to include both:
```html
<div
  v-if="visible"
  ref="popoverRef"
  class="attach-popover"
  :class="{ closing: isClosing, 'drag-over': dragOver }"
  :style="popoverStyle"
```

The pre-existing `:class` on line with `closing` must merge with `dragOver`. In the initial template above, `:class="{ closing: isClosing }"` — change to `:class="{ closing: isClosing, 'drag-over': dragOver }"`.

---

### Task 2: Modify App.vue — card attachment area

**Files:**
- Modify: `src/renderer/src/App.vue`

- [ ] **Step 1: Import AttachmentPopover**

Find the `<script setup>` section (starts around line 186). Add the import after the lucide-vue-next imports (after line 203):

```javascript
import AttachmentPopover from './components/AttachmentPopover.vue'
```

- [ ] **Step 2: Replace card attachment display (template)**

Find the card attachment span in the note-card template at line 83-87:

```html
<span v-if="note.attachments.length" class="attachment-count">
  <Paperclip :size="13" />
  {{ note.attachments.length }} 个附件
</span>
```

Replace with:

```html
<span
  v-if="note.attachments.length"
  ref="attachPillRefs"
  class="attach-pill"
  @click.stop="openAttachPopover(note, $event.target)"
>
  <Paperclip :size="12" />
  {{ note.attachments.length }}
</span>
```

- [ ] **Step 3: Remove old `.attachment-count` styles and add `.attach-pill` styles**

In `<style scoped>`, find the `.attachment-count` rule at line 624-628:

```css
.attachment-count {
  gap: 4px;
  color: var(--warning);
  font-size: 12px;
}
```

Replace with:

```css
.attach-pill {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 10px;
  cursor: pointer;
}

.attach-pill:hover {
  background: rgba(47, 125, 120, 0.2);
}
```

Also update the `.card-row` reference: add `.attach-pill` to the `, .remind-toggle` line at line 406 (the `.card-row` style) or add a new declaration. Since the pill is inside `.card-meta` which already uses `display: flex; align-items: center`, no additional layout change needed.

- [ ] **Step 4: Add popover state and handler functions**

In `<script setup>`, after the `const draft = reactive(defaultDraft())` line (line 215), add:

```javascript
const attachPopover = reactive({
  visible: false,
  note: null,
  anchorEl: null
})

function openAttachPopover(note, el) {
  // close if already open for same note
  if (attachPopover.visible && attachPopover.note?.id === note.id) {
    closeAttachPopover()
    return
  }
  attachPopover.note = note
  attachPopover.anchorEl = el
  attachPopover.visible = true
}

function closeAttachPopover() {
  attachPopover.visible = false
  attachPopover.note = null
  attachPopover.anchorEl = null
}

async function handleAttachAdd(paths) {
  if (!attachPopover.note) return
  const merged = [...new Set([...attachPopover.note.attachments, ...paths])]
  await notes.update(attachPopover.note.id, { attachments: merged })
  attachPopover.note.attachments = merged
}

async function handleAttachRemove(path) {
  if (!attachPopover.note) return
  const next = attachPopover.note.attachments.filter(f => f !== path)
  await notes.update(attachPopover.note.id, { attachments: next })
  attachPopover.note.attachments = next
}

function handleAttachOpen(path) {
  window.api?.files.openPath(path)
}
```

- [ ] **Step 5: Add click-outside and Esc listeners**

In the `onMounted` callback (around line 331), add after the existing IPC listener registrations:

```javascript
document.addEventListener('keydown', onKeyDown)
```

Add in `onBeforeUnmount` (around line 354):

```javascript
document.removeEventListener('keydown', onKeyDown)
```

Add the handler function before `onMounted`:

```javascript
function onKeyDown(e) {
  if (e.key === 'Escape' && attachPopover.visible) {
    closeAttachPopover()
  }
}
```

- [ ] **Step 6: Add AttachmentPopover to template**

After the editor overlay `</div>` (around line 182, the closing `</div>` of `v-if="editorOpen"`), add:

```html
<AttachmentPopover
  :attachments="attachPopover.note?.attachments || []"
  :anchor-el="attachPopover.anchorEl"
  :visible="attachPopover.visible"
  @close="closeAttachPopover"
  @add="handleAttachAdd"
  @remove="handleAttachRemove"
  @open="handleAttachOpen"
/>
```

Also add a click-outside overlay. When the popover is open and user clicks elsewhere on the page (not the popover itself), close it. This is handled by adding a transparent backdrop `<div>` that captures clicks. Add before the `<AttachmentPopover>` tag:

```html
<div
  v-if="attachPopover.visible"
  class="popover-backdrop"
  @click="closeAttachPopover"
/>
```

And add the style:

```css
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
```

---

### Task 3: electron-vite build verification

**Files:**
- None (build check only)

- [ ] **Step 1: Run electron-vite build**

Run:
```bash
cd C:\Users\70715\Documents\Codex\2026-05-24\files-mentioned-by-the-user-spec\bianqian-electron
npx electron-vite build
```

Expected: Build succeeds with no errors. Output shows main, preload, renderer all built successfully.

- [ ] **Step 2: Verify component file exists in output**

Run:
```bash
dir out\renderer\assets\*.js
```

Expected: At least one JS bundle file present. The Vue SFC should be compiled into the renderer bundle.

- [ ] **Step 3: Check for no console errors in build log**

Review the full build output for any warnings about unresolved imports, missing components, or template errors. Expected: clean output.

---

### Task 4: Update planning files and commit

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Update task_plan.md Phase 3 to done**

Edit `task_plan.md`: change Phase 3 status from `pending` to `done`, check all sub-tasks.

- [ ] **Step 2: Update progress.md with implementation summary**

Add to progress.md under Phase 3:
- Actions taken: Created AttachmentPopover.vue, modified App.vue card template and script, electron-vite build verified
- Files created: `src/renderer/src/components/AttachmentPopover.vue`
- Files modified: `src/renderer/src/App.vue`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AttachmentPopover.vue src/renderer/src/App.vue task_plan.md findings.md progress.md docs/
git commit -m "feat: add attachment popover interaction on note cards"
```
