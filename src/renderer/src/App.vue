<template>
  <ShortcutEditor v-if="isShortcutEditor" />
  <main v-else class="app-shell" :class="{ 'pass-through-mode': passThroughMode, 'mini-mode': isMiniMode }">
    <header class="app-header">
      <div>
        <p class="eyebrow">{{ notes.activeCategory }}</p>
        <h1>便签</h1>
      </div>
      <div class="header-actions">
        <button
          class="icon-button"
          :class="{ active: passThroughMode }"
          :title="passThroughMode ? '' : '开启鼠标穿透'"
          type="button"
          @click="togglePassThrough"
        >
          <MousePointer2 :size="18" />
        </button>
        <button
          class="icon-button"
          :class="{ active: isMiniMode }"
          :title="isMiniMode ? '恢复列表模式' : '迷你卡片模式'"
          type="button"
          @click="toggleMiniMode"
        >
          <Maximize2 v-if="isMiniMode" :size="18" />
          <Minimize2 v-else :size="18" />
        </button>
        <button class="icon-button" title="新建便签" type="button" @click="openEditor()">
          <Plus :size="18" />
        </button>
        <button class="icon-button" title="隐藏窗口" type="button" @click="hideWindow">
          <Minus :size="18" />
        </button>
      </div>
    </header>

    <section v-if="!isMiniMode" class="toolbar">
      <div class="search-box">
        <Search :size="15" />
        <input
          :value="notes.search"
          type="search"
          placeholder="搜索，或输入：明天9点交报告 #工作"
          @input="notes.setSearch($event.target.value)"
          @keydown.enter="handleSearchEnter"
        />
      </div>

      <div class="preset-strip">
        <button
          v-for="preset in modePresets"
          :key="preset.id"
          type="button"
          @click="applyPreset(preset)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div class="opacity-control" title="透明度">
        <SlidersHorizontal :size="14" />
        <input
          :value="Math.round(windowOpacity * 100)"
          type="range"
          min="35"
          max="100"
          step="5"
          @input="setWindowOpacity($event.target.value)"
        />
        <span>{{ Math.round(windowOpacity * 100) }}%</span>
      </div>

      <div class="edge-options">
        <label>
          <input
            type="checkbox"
            :checked="edgeAutoHide"
            @change="toggleEdgeAutoHide"
          />
          <span>贴边收纳</span>
        </label>
      </div>

      <div class="category-tabs">
        <button
          v-for="category in visibleCategories"
          :key="category"
          type="button"
          :class="{ active: notes.activeCategory === category }"
          @click="notes.setFilter(category)"
        >
          <span>{{ category }}</span>
          <small>{{ categoryCount(category) }}</small>
        </button>
      </div>
    </section>

    <section class="note-list" aria-label="便签列表">
      <article
        v-for="note in displayedNotes"
        :key="note.id"
        class="note-card"
        :class="{ completed: note.completed }"
        @click="openEditor(note)"
        @contextmenu.prevent="openContextMenu(note, $event)"
      >
        <div class="card-row card-top">
          <button class="check-button" title="切换完成状态" type="button" @click.stop="notes.toggleCompleted(note.id)">
            <CheckCircle v-if="note.completed" :size="18" />
            <Circle v-else :size="18" />
          </button>
          <button
            class="pin-button"
            :class="{ active: note.pinned }"
            :title="note.pinned ? '取消置顶' : '置顶便签'"
            type="button"
            @click.stop="notes.togglePinned(note.id)"
          >
            <Pin :size="14" />
          </button>
          <strong>{{ note.title }}</strong>
          <time>{{ note.time }}</time>
        </div>
        <p class="note-preview">{{ note.content || ' ' }}</p>
        <div class="card-row card-meta">
          <span class="category-pill">{{ note.category }}</span>
          <span
            v-if="note.attachments.length"
            class="attach-pill"
            @click.stop="openAttachPopover(note, $event)"
          >
            <Paperclip :size="12" />
            {{ note.attachments.length }}
          </span>
        </div>
      </article>

      <div v-if="!notes.filteredNotes.length" class="empty-state">
        <StickyNote :size="30" />
        <p>没有便签</p>
      </div>
    </section>

    <footer v-if="!isMiniMode" class="app-footer">
      <span>{{ notes.filteredNotes.length }} 条</span>
      <span>{{ todayLabel }}</span>
    </footer>

    <div v-if="editorOpen" class="editor-overlay" @click.self="closeEditor">
      <form class="editor-panel" @submit.prevent="saveEditor">
        <header class="editor-header">
          <h2>{{ draft.id ? '编辑便签' : '新建便签' }}</h2>
          <button class="icon-button" title="关闭" type="button" @click="closeEditor">
            <X :size="18" />
          </button>
        </header>

        <label class="field full">
          <span>标题</span>
          <input v-model.trim="draft.title" type="text" autofocus required @keydown.enter.prevent="saveEditor" />
        </label>

        <div class="field-grid">
          <label class="field">
            <span>日期</span>
            <input v-model="draft.date" type="date" />
          </label>
          <label class="field">
            <span>时间</span>
            <input v-model="draft.time" type="time" />
          </label>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>分类</span>
            <select v-model="draft.category">
              <option v-for="category in categories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </label>
          <label class="remind-toggle">
            <input v-model="draft.remind" type="checkbox" />
            <Bell v-if="draft.remind" :size="16" />
            <BellOff v-else :size="16" />
            <span>提醒</span>
          </label>
        </div>

        <label class="field full">
          <span>备注</span>
          <textarea v-model="draft.content" rows="5"></textarea>
        </label>

        <section class="attachments">
          <button class="secondary-button" type="button" @click="pickAttachments">
            <Paperclip :size="15" />
            附件
          </button>
          <div v-if="draft.attachments.length" class="attachment-list">
            <button
              v-for="file in draft.attachments"
              :key="file"
              class="attachment-chip"
              type="button"
              :title="file"
              @click="notes.openAttachment(file)"
            >
              <span>{{ fileName(file) }}</span>
              <X :size="13" @click.stop="removeAttachment(file)" />
            </button>
          </div>
        </section>

        <footer class="editor-actions">
          <button v-if="draft.id" class="danger-button" type="button" @click="deleteEditorNote">
            <Trash2 :size="15" />
            删除
          </button>
          <span></span>
          <button class="secondary-button" type="button" @click="closeEditor">取消</button>
          <button class="primary-button" type="submit">
            <Save :size="15" />
            保存
          </button>
        </footer>
      </form>
    </div>

    <AttachmentPopover
      :attachments="attachPopover.note?.attachments || []"
      :anchor-el="attachPopover.anchorEl"
      :visible="attachPopover.visible"
      @close="closeAttachPopover"
      @add="handleAttachAdd"
      @remove="handleAttachRemove"
      @open="handleAttachOpen"
    />

    <Teleport to="#popover-root">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button type="button" @click="ctxEdit">编辑</button>
        <button type="button" @click="ctxTogglePin">
          {{ contextMenu.note?.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button type="button" @click="ctxToggleComplete">
          {{ contextMenu.note?.completed ? '取消完成' : '标记完成' }}
        </button>
        <button type="button" @click="ctxDelete">删除</button>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  Bell,
  BellOff,
  CheckCircle,
  Circle,
  Maximize2,
  Minus,
  Minimize2,
  MousePointer2,
  Paperclip,
  Pin,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  X
} from 'lucide-vue-next'
import AttachmentPopover from './components/AttachmentPopover.vue'
import ShortcutEditor from './components/ShortcutEditor.vue'
import { ALL_CATEGORY, CATEGORIES, useNotesStore } from './stores/notes'

const isShortcutEditor = window.location.hash === '#shortcut-editor'

const notes = useNotesStore()
const categories = CATEGORIES
const visibleCategories = [ALL_CATEGORY, ...CATEGORIES]
const editorOpen = ref(false)
watch(editorOpen, (val) => {
  window.api?.window.setEditing(val)
})
const passThroughMode = ref(false)
const windowOpacity = ref(0.92)
const windowMode = ref('normal')
const edgeAutoHide = ref(false)
const unsubscribeHandlers = []
let reminderTimer = null

const draft = reactive(defaultDraft())

const attachPopover = reactive({
  visible: false,
  note: null,
  anchorEl: null
})

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  note: null
})

const isMiniMode = computed(() => windowMode.value === 'mini')
const displayedNotes = computed(() => (isMiniMode.value ? notes.filteredNotes.slice(0, 3) : notes.filteredNotes))
const modePresets = [
  { id: 'default', label: '常规', opacity: 0.92, passThrough: false, mode: 'normal' },
  { id: 'focus', label: '专注', opacity: 1, passThrough: false, mode: 'normal' },
  { id: 'meeting', label: '会议', opacity: 0.72, passThrough: true, mode: 'normal' },
  { id: 'minimal', label: '极简', opacity: 0.48, passThrough: true, mode: 'mini' }
]

function openAttachPopover(note, event) {
  if (attachPopover.visible && attachPopover.note?.id === note.id) {
    closeAttachPopover()
    return
  }
  attachPopover.note = note
  attachPopover.anchorEl = event.currentTarget
  attachPopover.visible = true
}

function closeAttachPopover() {
  attachPopover.visible = false
  attachPopover.note = null
}

function openContextMenu(note, event) {
  contextMenu.note = note
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.visible = true
  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 0)
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.note = null
}

function ctxEdit() {
  if (contextMenu.note) openEditor(contextMenu.note)
  closeContextMenu()
}

async function ctxToggleComplete() {
  if (contextMenu.note) await notes.toggleCompleted(contextMenu.note.id)
  closeContextMenu()
}

async function ctxTogglePin() {
  if (contextMenu.note) await notes.togglePinned(contextMenu.note.id)
  closeContextMenu()
}

async function ctxDelete() {
  if (contextMenu.note?.id) await notes.delete(contextMenu.note.id)
  closeContextMenu()
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

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).format(new Date())
)

function defaultDraft() {
  return {
    id: '',
    title: '',
    content: '',
    category: '工作',
    date: localDate(),
    time: '09:00',
    completed: false,
    remind: true,
    attachments: []
  }
}

function localDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function openEditor(note) {
  Object.assign(draft, note ? JSON.parse(JSON.stringify(note)) : defaultDraft())
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  Object.assign(draft, defaultDraft())
}

async function saveEditor() {
  if (!draft.title.trim()) {
    return
  }

  const payload = JSON.parse(JSON.stringify(draft))

  if (draft.id) {
    await notes.update(draft.id, payload)
  } else {
    await notes.create(payload)
  }

  closeEditor()
}

async function deleteEditorNote() {
  if (!draft.id || !confirm('删除这条便签？')) {
    return
  }

  await notes.delete(draft.id)
  closeEditor()
}

async function pickAttachments() {
  const files = await notes.chooseAttachments()
  const merged = new Set([...draft.attachments, ...files])
  draft.attachments = [...merged]
}

function removeAttachment(file) {
  draft.attachments = draft.attachments.filter((item) => item !== file)
}

function fileName(path) {
  return path.split(/[\\/]/).pop()
}

function categoryCount(category) {
  if (category === ALL_CATEGORY) {
    return notes.notes.length
  }

  return notes.categoryCounts[category] || 0
}

function hideWindow() {
  window.api?.window.hide()
}

async function refreshInteractionState() {
  const state = await window.api?.window.getInteractionState?.()
  passThroughMode.value = Boolean(state?.passThrough)
  windowOpacity.value = Number(state?.opacity || 0.92)
  windowMode.value = state?.windowMode || 'normal'
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
}

async function togglePassThrough() {
  const state = await window.api?.window.setPassThrough?.(!passThroughMode.value)
  passThroughMode.value = Boolean(state?.passThrough)
  windowOpacity.value = Number(state?.opacity || windowOpacity.value)
  windowMode.value = state?.windowMode || windowMode.value
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
}

async function setWindowOpacity(value) {
  const opacity = Number(value) / 100
  windowOpacity.value = opacity

  const state = await window.api?.window.setOpacity?.(opacity)

  if (state?.opacity) {
    windowOpacity.value = Number(state.opacity)
  }
}

async function toggleMiniMode() {
  const state = await window.api?.window.setMode?.(isMiniMode.value ? 'normal' : 'mini')
  windowMode.value = state?.windowMode || windowMode.value
}

async function toggleEdgeAutoHide() {
  const state = await window.api?.window.setEdgeAutoHide?.(!edgeAutoHide.value)
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
}

async function applyPreset(preset) {
  const modeState = await window.api?.window.setMode?.(preset.mode)
  const opacityState = await window.api?.window.setOpacity?.(preset.opacity)
  const passState = await window.api?.window.setPassThrough?.(preset.passThrough)
  const state = passState || opacityState || modeState
  passThroughMode.value = Boolean(state?.passThrough ?? preset.passThrough)
  windowOpacity.value = Number(state?.opacity || preset.opacity)
  windowMode.value = state?.windowMode || preset.mode
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
}

function handleSearchEnter(event) {
  const text = event.target.value.trim()
  if (!text) {
    return
  }

  createQuickNote(text)
}

async function createQuickNote(text) {
  const parsed = parseQuickNote(text)
  await notes.create(parsed)
  notes.setSearch('')
}

function parseQuickNote(text) {
  let source = text.trim()
  let category = '工作'
  const categoryMatch = source.match(/#(工作|生活|学习|会议|其他)(?=\s|$)/)
  if (categoryMatch) {
    category = categoryMatch[1]
    source = source.replace(categoryMatch[0], '')
  }

  const date = parseNaturalDate(source)
  source = source
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/, '')
    .replace(/今天|明天|后天/, '')

  const timeMatch = source.match(/(?:(上午|早上|下午|晚上)\s*(\d{1,2})(?:[:：点时](\d{1,2})?)?|(\d{1,2})[:：点时](\d{1,2})?)/)
  let time = '09:00'
  if (timeMatch) {
    let hour = Number(timeMatch[2] || timeMatch[4])
    const minute = Number(timeMatch[3] || timeMatch[5] || 0)
    const prefix = timeMatch[1] || ''
    if ((prefix.includes('下午') || prefix.includes('晚上')) && hour < 12) {
      hour += 12
    }
    time = `${String(Math.min(hour, 23)).padStart(2, '0')}:${String(Math.min(minute, 59)).padStart(2, '0')}`
    source = source.replace(timeMatch[0], '')
  }

  const title = source.replace(/\s+/g, ' ').trim() || text

  return {
    title,
    content: '',
    category,
    date,
    time,
    remind: true,
    completed: false,
    pinned: false,
    attachments: []
  }
}

function parseNaturalDate(text) {
  const explicit = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (explicit) {
    const [, year, month, day] = explicit
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const date = new Date()
  if (text.includes('明天')) {
    date.setDate(date.getDate() + 1)
  } else if (text.includes('后天')) {
    date.setDate(date.getDate() + 2)
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function onKeyDown(e) {
  if (e.key === 'Escape' && attachPopover.visible) {
    closeAttachPopover()
  }
}

onMounted(async () => {
  await notes.load()
  await refreshInteractionState()
  await notes.requestNotificationPermission()
  notes.checkReminders()
  reminderTimer = setInterval(() => notes.checkReminders(), 60000)

  if (window.api?.window.onFilterCategory) {
    unsubscribeHandlers.push(window.api.window.onFilterCategory((category) => notes.setFilter(category)))
  }
  if (window.api?.window.onCreateNote) {
    unsubscribeHandlers.push(window.api.window.onCreateNote(() => openEditor()))
  }
  if (window.api?.window.onInteractionState) {
    unsubscribeHandlers.push(
      window.api.window.onInteractionState((state) => {
        passThroughMode.value = Boolean(state?.passThrough)
        windowOpacity.value = Number(state?.opacity || windowOpacity.value)
        windowMode.value = state?.windowMode || windowMode.value
        edgeAutoHide.value = Boolean(state?.edgeAutoHide)
      })
    )
  }

  document.addEventListener('keydown', onKeyDown)

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
      window.api?.window.mouseLeave()
    }
  })
  document.addEventListener('mouseover', (e) => {
    if (!e.relatedTarget) {
      window.api?.window.mouseEnter()
    }
  })
})

onBeforeUnmount(() => {
  unsubscribeHandlers.forEach((unsubscribe) => unsubscribe())
  clearInterval(reminderTimer)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.app-shell {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-window);
  background: var(--bg-window);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  clip-path: inset(0 round var(--radius-window));
  isolation: isolate;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  -webkit-app-region: drag;
}

.app-header h1,
.editor-header h2,
.eyebrow {
  margin: 0;
}

.app-header h1 {
  font-size: 22px;
  line-height: 1.1;
}

.eyebrow {
  margin-bottom: 3px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.header-actions,
.editor-header,
.editor-actions,
.card-row,
.search-box,
.pin-button,
.remind-toggle,
.secondary-button,
.primary-button,
.danger-button,
.attachment-chip {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 6px;
  -webkit-app-region: no-drag;
}

.icon-button {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: var(--radius-control);
  color: var(--text);
  background: rgba(255, 255, 255, 0.62);
}

.icon-button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.icon-button.active {
  color: #fff;
  background: var(--accent);
}

.pass-through-mode .icon-button:not(.active):hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.62);
}

.toolbar {
  padding: 0 12px 10px;
}

.preset-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 8px;
}

.preset-strip button {
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.preset-strip button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.search-box {
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.78);
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
}

.opacity-control {
  display: grid;
  grid-template-columns: auto 1fr 38px;
  align-items: center;
  gap: 8px;
  height: 30px;
  margin-top: 8px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
}

.opacity-control input {
  width: 100%;
  accent-color: var(--accent);
}

.opacity-control span {
  font-size: 12px;
  text-align: right;
}

.edge-options {
  margin-top: 8px;
}

.edge-options label {
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.edge-options label:has(input:checked) {
  border-color: rgba(47, 125, 120, 0.42);
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-weight: 700;
}

.edge-options input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--accent);
}

.category-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 8px;
}

.category-tabs button {
  display: flex;
  min-width: 0;
  height: 30px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.category-tabs button.active {
  border-color: rgba(47, 125, 120, 0.42);
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-weight: 700;
}

.category-tabs small {
  min-width: 18px;
  color: inherit;
  opacity: 0.72;
}

.note-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 10px;
}

.note-card {
  flex: 0 0 auto;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
}

.note-card:hover {
  border-color: rgba(47, 125, 120, 0.52);
  background: var(--bg-card-hover);
}

.pass-through-mode .note-card:hover {
  border-color: var(--border);
  background: var(--bg-card);
}

.note-card.completed {
  opacity: 0.56;
}

.note-card.completed strong {
  text-decoration: line-through;
}

.card-top {
  gap: 7px;
}

.card-top strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-top time {
  color: var(--text-muted);
  font-size: 12px;
}

.check-button {
  display: inline-grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  place-items: center;
  border-radius: 999px;
  color: var(--accent);
  background: transparent;
}

.pin-button {
  width: 20px;
  height: 20px;
  justify-content: center;
  border-radius: 5px;
  color: var(--text-muted);
  background: transparent;
}

.pin-button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.pin-button:not(.active) {
  opacity: 0;
}

.note-card:hover .pin-button,
.pin-button:focus-visible {
  opacity: 1;
}

.note-preview {
  display: -webkit-box;
  min-height: 34px;
  margin: 6px 0 8px 29px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 17px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-meta {
  justify-content: space-between;
  gap: 8px;
  margin-left: 29px;
}

.category-pill {
  max-width: 76px;
  overflow: hidden;
  padding: 3px 8px;
  border-radius: var(--radius-small);
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.empty-state {
  display: grid;
  min-height: 170px;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--text-muted);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.app-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 14px 11px;
  color: var(--text-muted);
  font-size: 12px;
}

.editor-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 12px;
  background: rgba(20, 28, 27, 0.32);
}

.editor-panel {
  display: grid;
  width: min(100%, 360px);
  max-height: calc(100vh - 24px);
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
  border-radius: var(--radius-panel);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow);
}

.editor-header {
  justify-content: space-between;
}

.editor-header h2 {
  font-size: 17px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field {
  display: grid;
  gap: 6px;
}

.field.full {
  grid-column: 1 / -1;
}

.field span,
.remind-toggle span {
  color: var(--text-muted);
  font-size: 12px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  outline: 0;
  background: #fff;
  font-size: 13px;
}

.field input,
.field select {
  height: 34px;
  padding: 0 10px;
}

.field textarea {
  min-height: 102px;
  resize: vertical;
  padding: 9px 10px;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: rgba(47, 125, 120, 0.56);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.remind-toggle {
  gap: 7px;
  height: 34px;
  align-self: end;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: #fff;
}

.remind-toggle input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}

.attachments {
  display: grid;
  gap: 8px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attachment-chip {
  max-width: 100%;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  color: var(--text-muted);
  background: #fff;
  font-size: 12px;
}

.attachment-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-actions {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 8px;
}

.secondary-button,
.primary-button,
.danger-button {
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  font-size: 13px;
}

.secondary-button {
  border: 1px solid var(--border);
  color: var(--text);
  background: #fff;
}

.primary-button {
  color: #fff;
  background: var(--accent);
}

.danger-button {
  color: #fff;
  background: var(--danger);
}

.context-menu {
  position: absolute;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(30, 35, 34, 0.94);
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.mini-mode {
  grid-template-rows: auto 1fr;
}

.mini-mode .app-header {
  padding: 10px 10px 7px;
}

.mini-mode .app-header h1 {
  font-size: 17px;
}

.mini-mode .eyebrow {
  font-size: 11px;
}

.mini-mode .header-actions {
  gap: 4px;
}

.mini-mode .icon-button {
  width: 28px;
  height: 28px;
}

.mini-mode .note-list {
  gap: 6px;
  padding: 0 10px 10px;
}

.mini-mode .note-card {
  padding: 8px;
}

.mini-mode .note-preview {
  min-height: 0;
  margin: 3px 0 5px 29px;
  -webkit-line-clamp: 1;
}

.mini-mode .card-meta {
  display: none;
}

.context-menu button {
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.context-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.context-menu button:last-child {
  color: #ff6b6b;
}

.context-menu button:last-child:hover {
  background: rgba(255, 107, 107, 0.12);
}
</style>
