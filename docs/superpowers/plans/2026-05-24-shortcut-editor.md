# 快捷键系统 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 穿透模式增加 Ctrl+Shift+P 快捷键，并提供可自定义快捷键的配置窗口（托盘菜单入口，独立 BrowserWindow）。

**Architecture:** 重构 shortcuts.js 为动态注册模式——所有快捷键绑定从 electron-store 配置读取，支持运行时注销+重注册。新增 ShortcutEditor.vue 组件通过 hash 路由复用渲染进程。IPC 新增 shortcuts 命名空间。

**Tech Stack:** Electron globalShortcut API, Vue 3 SFC, electron-store

---

### Task 1: Update store.js — add shortcuts defaults

**Files:**
- Modify: `src/main/store.js`

- [ ] **Step 1: Add DEFAULT_SHORTCUTS constant and update settings defaults**

Read `src/main/store.js`. Find the `createStore()` function with the `defaults` object (around line 16). Change:

```javascript
defaults: {
  notes: [],
  settings: {
    opacity: 0.92
  }
}
```

To:

```javascript
defaults: {
  notes: [],
  settings: {
    opacity: 0.92,
    shortcuts: {
      'toggle-window': 'F3',
      'hide-window': 'Escape',
      'toggle-passthrough': 'Ctrl+Shift+P',
      'category-全部': 'Alt+1',
      'category-工作': 'Alt+2',
      'category-生活': 'Alt+3',
      'category-学习': 'Alt+4',
      'category-会议': 'Alt+5',
      'category-其他': 'Alt+6'
    }
  }
}
```

- [ ] **Step 2: Add getShortcuts/setShortcut helper functions**

After the existing `updateSettings()` function, add:

```javascript
export function getShortcuts() {
  return getSettings().shortcuts
}

export function setShortcut(id, binding) {
  const shortcuts = { ...getShortcuts() }
  // if new binding conflicts with another shortcut, clear the other one
  for (const [key, value] of Object.entries(shortcuts)) {
    if (value === binding && key !== id) {
      shortcuts[key] = ''
    }
  }
  shortcuts[id] = binding
  updateSettings({ shortcuts })
  return getShortcuts()
}

export function resetShortcuts() {
  const defaults = createStore().defaults?.settings?.shortcuts || {}
  updateSettings({ shortcuts: { ...defaults } })
  return getShortcuts()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/store.js
git commit -m "feat: add shortcuts defaults and helpers to store"
```

---

### Task 2: Refactor shortcuts.js — dynamic registration

**Files:**
- Modify: `src/main/shortcuts.js`

- [ ] **Step 1: Rewrite shortcuts.js for dynamic registration**

Replace the entire file content with:

```javascript
import { globalShortcut } from 'electron'
import { getShortcuts } from './store.js'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

let registeredBindings = {}
let handlers = {}

export function registerAllShortcuts(windowManager) {
  const shortcuts = getShortcuts()
  const window = windowManager.getWindow()

  // Clean up any previously registered shortcuts
  globalShortcut.unregisterAll()

  // Register global shortcuts (no window context needed)
  registerBinding('toggle-window', shortcuts['toggle-window'], () => {
    windowManager.toggle()
  })

  // Register window-level shortcuts
  if (window) {
    window.webContents.on('before-input-event', handleBeforeInput)
  }

  handlers.windowManager = windowManager
}

function handleBeforeInput(event, input) {
  if (input.type !== 'keyDown') return

  const shortcuts = getShortcuts()
  const pressed = inputToBinding(input)

  const actions = {
    'hide-window': () => { handlers.windowManager.hide(); event.preventDefault() }
  }

  // Check category shortcuts
  for (const cat of [ALL_CATEGORY, ...CATEGORIES]) {
    const id = `category-${cat}`
    if (pressed === shortcuts[id]) {
      const category = cat === ALL_CATEGORY ? ALL_CATEGORY : cat
      handlers.windowManager.show(category)
      event.preventDefault()
      return
    }
  }

  // Check hide-window
  if (pressed === shortcuts['hide-window']) {
    handlers.windowManager.hide()
    event.preventDefault()
    return
  }
}

function inputToBinding(input) {
  const parts = []
  if (input.control) parts.push('Ctrl')
  if (input.alt) parts.push('Alt')
  if (input.shift) parts.push('Shift')
  if (input.meta) parts.push('Meta')
  parts.push(input.key.length === 1 ? input.key.toUpperCase() : input.key)
  return parts.join('+')
}

function registerBinding(id, accelerator, callback) {
  if (!accelerator) return
  try {
    globalShortcut.register(accelerator, callback)
    registeredBindings[id] = accelerator
  } catch (e) {
    console.error(`Failed to register shortcut ${id}: ${accelerator}`, e)
  }
}

export function reregisterShortcut(id, newBinding) {
  const oldBinding = registeredBindings[id]
  if (oldBinding) {
    globalShortcut.unregister(oldBinding)
  }
  
  const shortcuts = getShortcuts()
  const action = shortcuts[id]
  // Re-register depends on the action type
  // For global shortcuts like toggle-window, re-register immediately
  if (id === 'toggle-window') {
    registerBinding(id, newBinding, () => handlers.windowManager.toggle())
  }
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll()
  registeredBindings = {}
}
```

- [ ] **Step 2: Update index.js to use new function name**

Read `src/main/index.js`. Change `registerShortcuts(windowManager)` to `registerAllShortcuts(windowManager)`. Change `unregisterShortcuts()` to `unregisterAllShortcuts()`. Update the import line accordingly.

- [ ] **Step 3: Run build**

```bash
npx electron-vite build
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main/shortcuts.js src/main/index.js
git commit -m "refactor: dynamic shortcut registration from store config"
```

---

### Task 3: Add shortcuts IPC handlers

**Files:**
- Modify: `src/main/ipc.js`

- [ ] **Step 1: Add shortcuts IPC handlers**

Read `src/main/ipc.js`. Add after the existing `window:set-opacity` handler (around line 48). Insert:

```javascript
ipcMain.handle('shortcuts:list', () => {
  const { getShortcuts } = require('./store.js')
  return getShortcuts()
})

ipcMain.handle('shortcuts:update', (_event, id, binding) => {
  const { setShortcut } = require('./store.js')
  const result = setShortcut(id, binding)
  reregisterShortcut(id, binding)
  return { ok: true, shortcuts: result }
})

ipcMain.handle('shortcuts:reset', () => {
  const { resetShortcuts } = require('./store.js')
  const result = resetShortcuts()
  // Re-register all
  globalShortcut.unregisterAll()
  registerAllShortcuts(handlers.windowManager)
  return { ok: true, shortcuts: result }
})
```

At the top of the file, update the import to also import from shortcuts.js:

```javascript
import { registerAllShortcuts, reregisterShortcut, unregisterAllShortcuts } from './shortcuts.js'
```

Note: The `handlers.windowManager` reference — the `registerIpc` function already receives `windowManager`. Store it for later use. Add at the top of `registerIpc()`:

```javascript
export function registerIpc(windowManager, trayController) {
  // Store for shortcut re-registration
  handlers.windowManager = windowManager
```

And since `reregisterShortcut` and `registerAllShortcuts` need `handlers.windowManager`, make sure those imports work correctly. The `registerIpc` function should pass `windowManager` to `shortcuts.js`'s internal state.

Actually, simplify: just import and call functions from shortcuts.js directly, passing windowManager where needed:

```javascript
import { reregisterShortcut, registerAllShortcuts } from './shortcuts.js'

// Inside registerIpc:
ipcMain.handle('shortcuts:update', (_event, id, binding) => {
  const result = setShortcut(id, binding)
  reregisterShortcut(id, binding, windowManager)
  return { ok: true, shortcuts: result }
})

ipcMain.handle('shortcuts:reset', () => {
  const result = resetShortcuts()
  globalShortcut.unregisterAll()
  registerAllShortcuts(windowManager)
  return { ok: true, shortcuts: result }
})
```

- [ ] **Step 2: Run build to verify**

```bash
npx electron-vite build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.js
git commit -m "feat: add shortcuts IPC handlers"
```

---

### Task 4: Update preload and tray

**Files:**
- Modify: `src/preload/index.js`
- Modify: `src/main/tray.js`
- Modify: `src/main/window-manager.js`

- [ ] **Step 1: Add shortcuts API to preload**

Read `src/preload/index.js`. Add to the `contextBridge.exposeInMainWorld('api', {` object, after the `window:` block:

```javascript
shortcuts: {
  list: () => ipcRenderer.invoke('shortcuts:list'),
  update: (id, binding) => ipcRenderer.invoke('shortcuts:update', id, binding),
  reset: () => ipcRenderer.invoke('shortcuts:reset')
}
```

- [ ] **Step 2: Add tray menu item**

Read `src/main/tray.js`. Find the `contextMenu` construction in `rebuildMenu()`. After the "鼠标穿透" menu item block and before the separator + "退出", add:

```javascript
{
  label: '快捷键设置',
  click: () => this.windowManager.openShortcutEditor()
}
```

- [ ] **Step 3: Add openShortcutEditor() to window-manager.js**

Read `src/main/window-manager.js`. Add a new method after `send()`:

```javascript
openShortcutEditor() {
  if (this.shortcutEditor && !this.shortcutEditor.isDestroyed()) {
    this.shortcutEditor.show()
    this.shortcutEditor.focus()
    return
  }

  this.shortcutEditor = new BrowserWindow({
    width: 340,
    height: 420,
    resizable: false,
    frame: false,
    parent: this.window,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  this.shortcutEditor.on('close', (e) => {
    e.preventDefault()
    this.shortcutEditor.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    this.shortcutEditor.loadURL(process.env.ELECTRON_RENDERER_URL + '#shortcut-editor')
  } else {
    this.shortcutEditor.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'shortcut-editor' })
  }

  this.shortcutEditor.once('ready-to-show', () => {
    this.shortcutEditor.show()
  })
}
```

Also initialize `this.shortcutEditor = null` in the constructor (add alongside `this.passThroughMode = false`).

- [ ] **Step 4: Run build**

```bash
npx electron-vite build
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.js src/main/tray.js src/main/window-manager.js
git commit -m "feat: add shortcut editor window, tray entry, and preload API"
```

---

### Task 5: Create ShortcutEditor.vue

**Files:**
- Create: `src/renderer/src/components/ShortcutEditor.vue`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/components/ShortcutEditor.vue`:

```vue
<template>
  <div class="shortcut-editor">
    <div class="se-header">
      <span>快捷键设置</span>
      <button class="se-close" type="button" @click="close">&#10005;</button>
    </div>

    <div class="se-body">
      <div
        v-for="item in shortcutList"
        :key="item.id"
        class="se-row"
      >
        <span class="se-label">{{ item.label }}</span>
        <div class="se-binding" :class="{ recording: recordingId === item.id }">
          <span
            v-if="recordingId === item.id"
            class="se-recording"
          >按下组合键...</span>
          <span
            v-else
            class="se-key"
          >{{ item.binding || '—' }}</span>
        </div>
        <button
          v-if="recordingId === item.id"
          class="se-action"
          type="button"
          @click="cancelRecord"
        >&#10005;</button>
        <button
          v-else
          class="se-action"
          type="button"
          @click="startRecord(item.id)"
        >&#9998;</button>
      </div>
    </div>

    <div class="se-footer">
      <button class="se-reset-btn" type="button" @click="resetAll">恢复默认</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const shortcuts = ref({})
const recordingId = ref(null)

const shortcutLabels = {
  'toggle-window': '切换窗口显示',
  'hide-window': '隐藏窗口',
  'toggle-passthrough': '穿透模式',
  'category-全部': '分类 — 全部',
  'category-工作': '分类 — 工作',
  'category-生活': '分类 — 生活',
  'category-学习': '分类 — 学习',
  'category-会议': '分类 — 会议',
  'category-其他': '分类 — 其他'
}

const shortcutList = computed(() =>
  Object.entries(shortcuts.value).map(([id, binding]) => ({
    id,
    label: shortcutLabels[id] || id,
    binding
  }))
)

async function load() {
  shortcuts.value = await window.api?.shortcuts.list() || {}
}

function close() {
  window.api?.window.hide()
}

async function startRecord(id) {
  recordingId.value = id
}

function cancelRecord() {
  recordingId.value = null
}

async function saveRecording(id, binding) {
  const prev = shortcuts.value[id]
  shortcuts.value[id] = binding
  recordingId.value = null

  const result = await window.api?.shortcuts.update(id, binding)
  if (!result?.ok) {
    shortcuts.value[id] = prev
  } else {
    shortcuts.value = result.shortcuts
  }
}

async function resetAll() {
  const result = await window.api?.shortcuts.reset()
  if (result?.ok) {
    shortcuts.value = result.shortcuts
  }
}

function onKeyDown(e) {
  if (!recordingId.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    cancelRecord()
    return
  }

  if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') {
    return
  }

  const parts = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)

  saveRecording(recordingId.value, parts.join('+'))
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeyDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<style scoped>
.shortcut-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  color: var(--text);
  font-size: 12px;
  user-select: none;
}

.se-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--accent-soft);
  border-bottom: 1px solid rgba(47, 125, 120, 0.12);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-strong);
  -webkit-app-region: drag;
}

.se-close {
  border: 0;
  background: none;
  cursor: pointer;
  color: #999;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  -webkit-app-region: no-drag;
}

.se-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.se-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 4px 8px;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid rgba(38, 57, 54, 0.06);
}

.se-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.se-binding {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  min-width: 80px;
  text-align: center;
  background: rgba(47, 125, 120, 0.06);
}

.se-binding.recording {
  background: rgba(47, 125, 120, 0.16);
  border: 1px solid var(--accent);
  animation: se-pulse 0.8s infinite;
}

.se-key {
  color: var(--text);
}

.se-recording {
  color: var(--accent-strong);
}

.se-action {
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--accent);
  font-size: 11px;
  padding: 2px;
}

.se-footer {
  border-top: 1px solid rgba(38, 57, 54, 0.08);
  padding: 8px 12px;
  text-align: right;
}

.se-reset-btn {
  border: 1px solid rgba(38, 57, 54, 0.12);
  border-radius: 6px;
  padding: 5px 14px;
  background: #fff;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.se-reset-btn:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

@keyframes se-pulse {
  0%, 100% { border-color: var(--accent); }
  50%     { border-color: transparent; }
}
</style>
```

- [ ] **Step 2: Run build**

```bash
npx electron-vite build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ShortcutEditor.vue
git commit -m "feat: add ShortcutEditor component"
```

---

### Task 6: Update App.vue — hash routing

**Files:**
- Modify: `src/renderer/src/App.vue`

- [ ] **Step 1: Add hash routing and ShortcutEditor import**

Read `src/renderer/src/App.vue`. Add import:

```javascript
import ShortcutEditor from './components/ShortcutEditor.vue'
```

Add at the top of the `<template>`, before `<main class="app-shell">`:

```html
<template>
  <ShortcutEditor v-if="isShortcutEditor" />
  <main v-else class="app-shell" :class="{ 'pass-through-mode': passThroughMode }">
```

In `<script setup>`, add:

```javascript
const isShortcutEditor = window.location.hash === '#shortcut-editor'
```

Note: Need to close the template properly — the existing `</template>` tag closes the component. The v-if/v-else pattern must be at the root level.

- [ ] **Step 2: Run build**

```bash
npx electron-vite build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.vue
git commit -m "feat: add hash routing for shortcut editor"
```

---

### Task 7: Final build verification and integration test

**Files:**
- None (verification only)

- [ ] **Step 1: Full clean build**

```bash
npx electron-vite build
```
Expected: All three bundles (main, preload, renderer) build successfully.

- [ ] **Step 2: Verify dev mode launch**

Start dev mode and verify:
- F3 toggles window (unchanged behavior)
- Escape hides window (unchanged behavior)
- Ctrl+Shift+P toggles passthrough mode
- Tray menu has "快捷键设置" entry
- Shortcut editor window opens and shows all shortcuts

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git commit -m "chore: final verification fixes"
```
