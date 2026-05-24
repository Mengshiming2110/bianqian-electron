<template>
  <ShortcutEditor v-if="isShortcutEditor" />
  <main v-else class="app-shell" :class="{ 'pass-through-mode': passThroughMode }">
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
        <button class="icon-button" title="新建便签" type="button" @click="openEditor()">
          <Plus :size="18" />
        </button>
        <button class="icon-button" title="隐藏窗口" type="button" @click="hideWindow">
          <Minus :size="18" />
        </button>
      </div>
    </header>

    <section class="toolbar">
      <div class="search-box">
        <Search :size="15" />
        <input
          :value="notes.search"
          type="search"
          placeholder="搜索标题或备注"
          @input="notes.setSearch($event.target.value)"
        />
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
        v-for="note in notes.filteredNotes"
        :key="note.id"
        class="note-card"
        :class="{ completed: note.completed }"
        @click="openEditor(note)"
      >
        <div class="card-row card-top">
          <button class="check-button" title="切换完成状态" type="button" @click.stop="notes.toggleCompleted(note.id)">
            <CheckCircle v-if="note.completed" :size="18" />
            <Circle v-else :size="18" />
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

    <footer class="app-footer">
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

    <div
      v-if="attachPopover.visible"
      class="popover-backdrop"
      @click="closeAttachPopover"
    />

    <AttachmentPopover
      :attachments="attachPopover.note?.attachments || []"
      :anchor-right="attachPopover.anchorRight"
      :anchor-bottom="attachPopover.anchorBottom"
      :anchor-top="attachPopover.anchorTop"
      :visible="attachPopover.visible"
      @close="closeAttachPopover"
      @add="handleAttachAdd"
      @remove="handleAttachRemove"
      @open="handleAttachOpen"
    />
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  Bell,
  BellOff,
  CheckCircle,
  Circle,
  Minus,
  MousePointer2,
  Paperclip,
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
const passThroughMode = ref(false)
const windowOpacity = ref(0.92)
const unsubscribeHandlers = []
let reminderTimer = null

const draft = reactive(defaultDraft())

const attachPopover = reactive({
  visible: false,
  note: null,
  anchorRight: 0,
  anchorBottom: 0,
  anchorTop: 0
})

function openAttachPopover(note, event) {
  if (attachPopover.visible && attachPopover.note?.id === note.id) {
    closeAttachPopover()
    return
  }
  const rect = event.currentTarget.getBoundingClientRect()
  attachPopover.note = note
  attachPopover.anchorRight = rect.right
  attachPopover.anchorBottom = rect.bottom
  attachPopover.anchorTop = rect.top
  attachPopover.visible = true
}

function closeAttachPopover() {
  attachPopover.visible = false
  attachPopover.note = null
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
}

async function togglePassThrough() {
  const state = await window.api?.window.setPassThrough?.(!passThroughMode.value)
  passThroughMode.value = Boolean(state?.passThrough)
  windowOpacity.value = Number(state?.opacity || windowOpacity.value)
}

async function setWindowOpacity(value) {
  const opacity = Number(value) / 100
  windowOpacity.value = opacity

  const state = await window.api?.window.setOpacity?.(opacity)

  if (state?.opacity) {
    windowOpacity.value = Number(state.opacity)
  }
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
      })
    )
  }

  document.addEventListener('keydown', onKeyDown)
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
  background-clip: padding-box;
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

.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
</style>
