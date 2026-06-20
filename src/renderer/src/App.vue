<template>
  <ShortcutEditor v-if="isShortcutEditor" />
  <main v-else-if="!hasError" ref="appShellRef" class="app-shell" :class="{
    'pass-through-mode': passThroughMode,
    'mini-mode': isMiniMode,
    'mode-transitioning': modeTransition !== 'idle',
    'transition-to-mini': modeTransition === 'to-mini',
    'transition-to-normal': modeTransition === 'to-normal'
  }">
    <header class="app-header">
      <div>
        <p class="eyebrow">{{ notes.activeCategory }}</p>
        <h1>便签</h1>
      </div>
      <div class="header-actions">
        <button
          ref="settingsButtonRef"
          class="icon-button"
          :class="{ active: settingsOpen }"
          title="设置"
          type="button"
          @click="toggleSettings"
        >
          <Settings :size="18" />
        </button>
        <button class="icon-button" title="新建便签" type="button" @click="openEditor()">
          <Plus :size="18" />
        </button>
        <button class="icon-button" title="隐藏窗口" type="button" @click="hideWindow">
          <Minus :size="18" />
        </button>
      </div>
    </header>

    <div v-show="isMiniMode || modeTransition !== 'idle'" class="mini-drag-bar"></div>

    <section v-show="!isMiniMode || modeTransition !== 'idle'" class="toolbar">
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
    </section>

    <section class="note-list" :class="{ 'sort-active': sortDrag.active, 'sort-settling': sortDrag.settling }" aria-label="便签列表">
      <article
        v-for="note in displayedNotes"
        :key="note.id"
        :data-note-id="note.id"
        class="note-card"
        :class="{
          completed: note.completed,
          'animating-completing': animatingCardIds.get(note.id) === 'completing',
          'animating-incompleting': animatingCardIds.get(note.id) === 'incompleting',
          'drag-over': dragTargetNoteId === note.id,
          'sort-dragging': sortDrag.active && sortDrag.noteId === note.id,
          'sort-pulsed': sortDrag.pulsed[note.id],
          ['color-' + note.color]: note.color
        }"
        :style="getSortDragStyle(note.id)"
        @mousedown="onSortMouseDown(note, $event)"
        @click="onCardClick(note)"
        @contextmenu.prevent="openContextMenu(note, $event)"
        @dragover.prevent="onNoteDragOver(note, $event)"
        @dragleave="onNoteDragLeave(note, $event)"
        @drop.prevent.stop="onNoteDrop(note, $event)"
      >
        <div class="card-row card-top">
          <button class="check-button" title="切换完成状态" type="button" @click.stop="handleToggleCompleted(note.id)">
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
        <MarkdownPreview v-if="note.content" :content="note.content" :is-mini="isMiniMode" />
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

    <footer v-show="!isMiniMode || modeTransition !== 'idle'" class="app-footer">
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
            <span>分类</span>
            <select v-model="draft.category">
              <option v-for="category in categories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>颜色</span>
            <div class="color-picker-row">
              <button
                v-for="c in noteColors"
                :key="c.value"
                type="button"
                class="color-picker-dot"
                :class="[c.value ? 'dot-' + c.value : 'dot-default', { active: draft.color === c.value }]"
                :title="c.label"
                @click="draft.color = c.value"
              ></button>
            </div>
          </label>
        </div>
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
          <label class="remind-toggle">
            <input v-model="draft.remind" type="checkbox" />
            <Bell v-if="draft.remind" :size="16" />
            <BellOff v-else :size="16" />
            <span>提醒</span>
          </label>
        </div>

        <label class="field full">
          <span>备注</span>
          <div class="md-editor-row">
            <textarea v-model="draft.content" rows="8" class="md-textarea"></textarea>
            <MarkdownPreview v-if="draft.content" :content="draft.content" :is-mini="false" class="md-editor-preview" />
          </div>
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
      :max-attachments="MAX_ATTACHMENTS_PER_NOTE"
      :visible="attachPopover.visible"
      @close="closeAttachPopover"
      @add="handleAttachAdd"
      @remove="handleAttachRemove"
      @open="handleAttachOpen"
    />

  </main>
  <div v-if="hasError" class="error-fallback">
    <StickyNote :size="30" />
    <p>出了点问题</p>
    <button type="button" @click="hasError = false">重试</button>
  </div>
</template>

<script setup>
import { computed, onErrorCaptured, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import {
  Bell,
  BellOff,
  Check,
  CheckCircle,
  Circle,
  Minus,
  Moon,
  Paperclip,
  Pin,
  Plus,
  Save,
  Search,
  Settings,
  StickyNote,
  Sun,
  Trash2,
  X
} from 'lucide-vue-next'
import AttachmentPopover from './components/AttachmentPopover.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import ShortcutEditor from './components/ShortcutEditor.vue'
import { ALL_CATEGORY, CATEGORIES, MAX_ATTACHMENTS_PER_NOTE, loadCategories, useNotesStore } from './stores/notes'

const isShortcutEditor = window.location.hash === '#shortcut-editor'

const notes = useNotesStore()
const categories = CATEGORIES
const noteColors = [
  { value: '', label: '默认' },
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' }
]
const visibleCategories = [ALL_CATEGORY, ...CATEGORIES]
const editorOpen = ref(false)
const settingsOpen = ref(false)
const settingsButtonRef = ref(null)
watch(editorOpen, (val) => {
  window.api?.window.setEditing(val)
})
const passThroughMode = ref(false)
const windowOpacity = ref(0.92)
const windowMode = ref('normal')
const edgeAutoHide = ref(false)
const themePreference = ref('system')
const systemDark = ref(false)
let darkModeMq = null

const resolvedTheme = computed(() => {
  if (themePreference.value === 'system') return systemDark.value ? 'dark' : 'light'
  return themePreference.value
})

watch(resolvedTheme, (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
}, { immediate: true })

const themeLabel = computed(() => {
  const map = { system: '跟随系统', light: '浅色', dark: '深色' }
  return map[themePreference.value] || '跟随系统'
})

const modeTransition = ref('idle')
const resizePaused = ref(false)
const animatingCardIds = reactive(new Map())
const hasError = ref(false)
const appShellRef = ref(null)
const dragTargetNoteId = ref('')
const sortDrag = reactive({
  active: false,
  noteId: '',
  startY: 0,
  deltaY: 0,
  cardHeight: 0,
  cardGap: 0,
  shifts: {},
  settling: false,
  pulsed: {}
})
const sortDragJustEnded = ref(false)
let sortDragStarted = false
let sortDragStartX = 0
let sortDragStartY = 0
let lastShiftCount = 0
let pulseCleanupTimers = {}
const unsubscribeHandlers = []
let reminderTimer = null
let resizeObserver = null
let resizeDebounce = null
let lastFileDropKey = ''
let lastFileDropAt = 0
let originalDraftAttachments = []

const draft = reactive(defaultDraft())

const attachPopover = reactive({
  visible: false,
  note: null,
  anchorEl: null
})

const isMiniMode = computed(() => windowMode.value === 'mini')
const displayedNotes = computed(() => (isMiniMode.value ? notes.filteredNotes.slice(0, 3) : notes.filteredNotes))
const modePresets = [
  { id: 'default', label: '常规', opacity: 0.92, passThrough: false, mode: 'normal' },
  { id: 'focus', label: '专注', opacity: 1, passThrough: false, mode: 'normal' },
  { id: 'meeting', label: '会议', opacity: 0.72, passThrough: true, mode: 'normal' },
  { id: 'minimal', label: '极简', opacity: 0.48, passThrough: false, mode: 'mini' }
]

let skipNextResize = false

watch(
  () => notes.filteredNotes.map((note) => `${note.id}:${note.title}:${note.content}:${note.attachments.length}:${note.completed}:${note.pinned}`).join('|'),
  () => {
    clearTimeout(resizeDebounce)
    if (skipNextResize) {
      skipNextResize = false
      return
    }
    resizeDebounce = setTimeout(syncContentHeight, 80)
  }
)

function toggleSettings() {
  if (isMiniMode.value) return

  if (settingsOpen.value) {
    window.api?.settingsWindow?.close()
    return
  }

  const button = settingsButtonRef.value
  if (!button) return

  const rect = button.getBoundingClientRect()
  const screenX = window.screenX + rect.right - 252
  const screenY = window.screenY + rect.bottom + 8

  settingsOpen.value = true
  window.api?.settingsWindow?.open(screenX, screenY)
}

function closeSettings() {
  settingsOpen.value = false
  window.api?.settingsWindow?.close()
}

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

function hasDroppedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).some((type) => String(type).toLowerCase() === 'files')
}

function onCardClick(note) {
  if (sortDrag.active || sortDrag.settling || sortDragJustEnded.value) return
  openEditor(note)
}

async function popOutNote(note) {
  if (!window.api?.noteWindow) return
  await window.api.noteWindow.open(note.id, {
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    color: note.color
  })
}

function getSortDragStyle(noteId) {
  const offset = sortDrag.shifts[noteId]
  if (offset == null) return

  const isDragged = sortDrag.active && noteId === sortDrag.noteId
  if (isDragged) {
    return {
      transform: `translateY(${offset}px) scale(1.02)`,
      zIndex: 100,
      transition: 'none'
    }
  }
  return { transform: `translateY(${offset}px)` }
}

function onSortMouseDown(note, event) {
  if (isMiniMode.value) return
  if (event.button !== 0) return
  if (event.target.closest('button, a, input, select, textarea')) return

  sortDragStarted = false
  sortDragStartX = event.clientX
  sortDragStartY = event.clientY
  sortDrag.noteId = note.id

  const card = event.currentTarget
  sortDrag.cardHeight = card.offsetHeight
  const list = card.parentElement
  const cards = list.querySelectorAll('.note-card')
  if (cards.length >= 2) {
    const r0 = cards[0].getBoundingClientRect()
    const r1 = cards[1].getBoundingClientRect()
    sortDrag.cardGap = r1.top - r0.bottom
  } else {
    sortDrag.cardGap = 8
  }

  document.addEventListener('mousemove', onSortMouseMove)
  document.addEventListener('mouseup', onSortMouseUp)
  event.preventDefault()
}

function onSortMouseMove(event) {
  const dx = event.clientX - sortDragStartX
  const dy = event.clientY - sortDragStartY

  if (!sortDragStarted) {
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    sortDragStarted = true
    sortDrag.active = true
    sortDrag.startY = sortDragStartY
    sortDrag.deltaY = 0
    sortDrag.shifts = {}
    sortDrag.pulsed = {}
    lastShiftCount = 0
    pulseCleanupTimers = {}
  }

  sortDrag.deltaY = event.clientY - sortDrag.startY

  const list = document.querySelector('.note-list')
  if (!list) return
  const cards = list.querySelectorAll('.note-card')
  const dragIndex = Array.from(cards).findIndex((c) => c.dataset.noteId === sortDrag.noteId)
  if (dragIndex === -1) return

  const step = sortDrag.cardHeight + sortDrag.cardGap
  const shiftCount = Math.round(sortDrag.deltaY / step)

  if (shiftCount > lastShiftCount) {
    for (let s = lastShiftCount + 1; s <= shiftCount; s++) {
      const idx = dragIndex + s
      if (idx >= 0 && idx < cards.length) {
        const pid = cards[idx].dataset.noteId
        sortDrag.pulsed[pid] = true
        clearTimeout(pulseCleanupTimers[pid])
        pulseCleanupTimers[pid] = setTimeout(() => { delete sortDrag.pulsed[pid] }, 220)
      }
    }
  } else if (shiftCount < lastShiftCount) {
    for (let s = lastShiftCount - 1; s >= shiftCount; s--) {
      const idx = dragIndex + s
      if (idx >= 0 && idx < cards.length) {
        const pid = cards[idx].dataset.noteId
        sortDrag.pulsed[pid] = true
        clearTimeout(pulseCleanupTimers[pid])
        pulseCleanupTimers[pid] = setTimeout(() => { delete sortDrag.pulsed[pid] }, 220)
      }
    }
  }
  lastShiftCount = shiftCount

  const newShifts = {}
  newShifts[sortDrag.noteId] = sortDrag.deltaY

  for (let i = 0; i < cards.length; i++) {
    if (i === dragIndex) continue
    if (shiftCount > 0 && i > dragIndex && i <= dragIndex + shiftCount) {
      newShifts[cards[i].dataset.noteId] = -step
    } else if (shiftCount < 0 && i < dragIndex && i >= dragIndex + shiftCount) {
      newShifts[cards[i].dataset.noteId] = step
    }
  }

  sortDrag.shifts = newShifts
}

async function onSortMouseUp() {
  document.removeEventListener('mousemove', onSortMouseMove)
  document.removeEventListener('mouseup', onSortMouseUp)

  if (sortDragStarted) {
    const list = document.querySelector('.note-list')
    const cards = list ? list.querySelectorAll('.note-card') : []
    const dragIndex = Array.from(cards).findIndex((c) => c.dataset.noteId === sortDrag.noteId)
    const step = sortDrag.cardHeight + sortDrag.cardGap
    const shiftCount = Math.round(sortDrag.deltaY / step)

    if (dragIndex !== -1 && shiftCount !== 0) {
      const targetIndex = dragIndex + shiftCount
      if (targetIndex >= 0 && targetIndex < cards.length) {
        const targetId = cards[targetIndex].dataset.noteId
        const position = shiftCount > 0 ? 'after' : 'before'
        skipNextResize = true
        await notes.reorderNote(sortDrag.noteId, targetId, position)
      }
    }

    sortDragJustEnded.value = true
    setTimeout(() => { sortDragJustEnded.value = false }, 100)

    sortDrag.settling = true
    sortDrag.shifts = {}
    sortDrag.pulsed = {}
    Object.values(pulseCleanupTimers).forEach(clearTimeout)
    pulseCleanupTimers = {}
    setTimeout(() => {
      sortDrag.active = false
      sortDrag.settling = false
      sortDrag.noteId = ''
      sortDrag.shifts = {}
      sortDrag.deltaY = 0
      sortDragStarted = false
    }, 280)
    return
  }

  sortDrag.active = false
  sortDrag.noteId = ''
  sortDrag.shifts = {}
  sortDrag.deltaY = 0
  sortDragStarted = false
}

function onNoteDragOver(note, event) {
  if (!hasDroppedFiles(event)) return
  event.dataTransfer.dropEffect = 'copy'
  dragTargetNoteId.value = note.id
}

function onNoteDragLeave(note, event) {
  if (dragTargetNoteId.value !== note.id) return
  if (event.currentTarget.contains(event.relatedTarget)) return
  dragTargetNoteId.value = ''
}

async function onNoteDrop(note, event) {
  dragTargetNoteId.value = ''
  const files = event.dataTransfer?.files
  console.info('[attachments] card drop', { noteId: note.id, fileCount: files?.length || 0 })
  if (!files?.length) return

  const paths = notes.filePathsFromDrop(files)
  console.info('[attachments] card drop paths', { noteId: note.id, count: paths.length, paths })
  if (!paths.length) return

  await addDroppedPathsToNote(note, paths)
}

function findDropNote(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)
  const card = target?.closest?.('.note-card')
  const noteId = card?.dataset?.noteId || dragTargetNoteId.value
  if (!noteId) return null
  return notes.notes.find((note) => note.id === noteId) || null
}

function fileDropKey(note, paths) {
  return `${note.id}:${paths.join('\n')}`
}

function isRecentFileDrop(key) {
  const now = Date.now()
  if (lastFileDropKey === key && now - lastFileDropAt < 1200) return true
  lastFileDropKey = key
  lastFileDropAt = now
  return false
}

async function addDroppedPathsToNote(note, paths) {
  const incoming = Array.isArray(paths) ? paths.filter(Boolean) : []
  if (!note || !incoming.length) return

  const key = fileDropKey(note, incoming)
  if (isRecentFileDrop(key)) return

  console.info('[attachments] add dropped paths', { noteId: note.id, count: incoming.length, paths: incoming })
  await addAttachmentsToNote(note, incoming)
}

async function onPreloadFileDrop(event) {
  const message = event.data
  if (message?.source !== 'bianqian-preload' || message.type !== 'file-drop') return

  const note = findDropNote(message.clientX, message.clientY)
  console.info('[attachments] preload drop message', {
    foundNote: note?.id || '',
    count: Array.isArray(message.paths) ? message.paths.length : 0,
    x: message.clientX,
    y: message.clientY
  })
  if (!note) return

  dragTargetNoteId.value = ''
  await addDroppedPathsToNote(note, message.paths)
}

function openContextMenu(note, event) {
  window.api?.contextMenu?.show({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    color: note.color,
    pinned: note.pinned,
    completed: note.completed
  })
}

function handleContextMenuAction({ action, noteId, value }) {
  switch (action) {
    case 'edit': {
      const note = notes.notes.find(n => n.id === noteId)
      if (note) openEditor(note)
      break
    }
    case 'togglePin': notes.togglePinned(noteId); break
    case 'toggleComplete': handleToggleCompleted(noteId); break
    case 'changeCategory': notes.update(noteId, { category: value }); break
    case 'changeColor': notes.update(noteId, { color: value }); break
    case 'popOut': {
      const note = notes.notes.find(n => n.id === noteId)
      if (note) popOutNote(note)
      break
    }
    case 'delete':
      notes.delete(noteId)
      break
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cancelSortDrag() {
  document.removeEventListener('mousemove', onSortMouseMove)
  document.removeEventListener('mouseup', onSortMouseUp)
  sortDrag.active = false
  sortDrag.settling = false
  sortDrag.noteId = ''
  sortDrag.shifts = {}
  sortDrag.pulsed = {}
  sortDrag.deltaY = 0
  sortDragStarted = false
  lastShiftCount = 0
  Object.values(pulseCleanupTimers).forEach(clearTimeout)
  pulseCleanupTimers = {}
}

async function handleToggleCompleted(noteId) {
  const note = notes.notes.find(n => n.id === noteId)
  if (!note) return
  const wasCompleted = note.completed
  const animKey = wasCompleted ? 'incompleting' : 'completing'
  animatingCardIds.set(noteId, animKey)
  await notes.toggleCompleted(noteId)
  await nextTick()
  setTimeout(() => {
    if (animatingCardIds.get(noteId) === animKey) animatingCardIds.delete(noteId)
  }, 500)
}

async function setTheme(value) {
  themePreference.value = value
  if (!window.api) {
    try { localStorage.setItem('bianqian-theme', value) } catch {}
    return
  }
  await window.api.window.setTheme(value)
}

function setupSystemThemeListener() {
  darkModeMq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = darkModeMq.matches
  darkModeMq.addEventListener('change', (e) => { systemDark.value = e.matches })
}

async function handleAttachAdd(paths) {
  if (!attachPopover.note) return
  const updated = await addAttachmentsToNote(attachPopover.note, paths)
  attachPopover.note.attachments = updated.attachments
}

async function handleAttachRemove(path) {
  if (!attachPopover.note) return
  const next = attachPopover.note.attachments.filter(f => f !== path)
  const updated = await notes.update(attachPopover.note.id, { attachments: next })
  attachPopover.note.attachments = updated.attachments
  await notes.cleanupAttachments([path])
}

function handleAttachOpen(path) {
  window.api?.files.openPath(path)
}

async function addAttachmentsToNote(note, paths) {
  const incoming = Array.isArray(paths) ? paths : []
  const remaining = remainingAttachmentSlots(note.attachments)
  console.info('[attachments] add to note', { noteId: note.id, incoming: incoming.length, remaining })
  if (remaining <= 0 || !incoming.length) {
    return note
  }

  const imported = await notes.importAttachments(incoming, remaining)
  console.info('[attachments] imported', { noteId: note.id, count: imported.length, imported })
  const candidates = [...incoming, ...imported]
  const merged = mergeAttachments(note.attachments, candidates)
  const updated = await notes.update(note.id, { attachments: merged })
  console.info('[attachments] note updated', { noteId: note.id, count: updated.attachments.length })
  await cleanupUnusedCopies(candidates, updated.attachments)
  return updated
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
    color: '',
    attachments: []
  }
}

function mergeAttachments(existing, incoming) {
  return [...new Set([...(existing || []), ...(incoming || [])])].slice(0, MAX_ATTACHMENTS_PER_NOTE)
}

function remainingAttachmentSlots(attachments) {
  return Math.max(0, MAX_ATTACHMENTS_PER_NOTE - (attachments?.length || 0))
}

async function cleanupUnusedCopies(candidates, used) {
  const usedSet = new Set(used || [])
  const unused = [...new Set((candidates || []).filter((file) => !usedSet.has(file)))]
  if (unused.length) {
    await notes.cleanupAttachments(unused)
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
  originalDraftAttachments = [...(draft.attachments || [])]
  editorOpen.value = true
}

async function closeEditor(options = {}) {
  if (options?.cleanup !== false) {
    await cleanupUnusedCopies(draft.attachments, originalDraftAttachments)
  }
  editorOpen.value = false
  Object.assign(draft, defaultDraft())
  originalDraftAttachments = []
}

async function saveEditor() {
  if (!draft.title.trim()) {
    return
  }

  const payload = JSON.parse(JSON.stringify(draft))

  if (draft.id) {
    const saved = await notes.update(draft.id, payload)
    await cleanupUnusedCopies([...originalDraftAttachments, ...payload.attachments], saved.attachments)
  } else {
    const saved = await notes.create(payload)
    await cleanupUnusedCopies(payload.attachments, saved.attachments)
  }

  await closeEditor({ cleanup: false })
}

async function deleteEditorNote() {
  if (!draft.id || !confirm('删除这条便签？')) {
    return
  }

  await notes.delete(draft.id)
  await closeEditor({ cleanup: false })
}

async function pickAttachments() {
  const remaining = remainingAttachmentSlots(draft.attachments)
  console.info('[attachments] editor pick click', { remaining, hasApi: Boolean(window.api?.files?.selectAttachments) })
  if (remaining <= 0) return

  const files = await notes.chooseAttachments(remaining)
  console.info('[attachments] editor pick result', { count: files?.length || 0, files })
  draft.attachments = mergeAttachments(draft.attachments, files)
  await cleanupUnusedCopies(files, draft.attachments)
}

async function removeAttachment(file) {
  draft.attachments = draft.attachments.filter((item) => item !== file)
  if (!originalDraftAttachments.includes(file)) {
    await notes.cleanupAttachments([file])
  }
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
  if (state?.theme) themePreference.value = state.theme
}

async function togglePassThrough() {
  if (!passThroughMode.value && settingsOpen.value) closeSettings()
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

async function setMode(mode) {
  if (mode === 'mini' && settingsOpen.value) closeSettings()
  const targetIsMini = mode === 'mini'
  if (targetIsMini === isMiniMode.value) return

  if (sortDrag.active || sortDrag.settling) cancelSortDrag()
  resizePaused.value = true

  if (targetIsMini) {
    modeTransition.value = 'to-mini'
    const state = await window.api?.window.setMode?.('mini')
    await delay(280)
    windowMode.value = state?.windowMode || mode
    edgeAutoHide.value = Boolean(state?.edgeAutoHide)
    await nextTick()
  } else {
    const state = await window.api?.window.setMode?.('normal')
    windowMode.value = state?.windowMode || mode
    edgeAutoHide.value = Boolean(state?.edgeAutoHide)
    await nextTick()
    modeTransition.value = 'to-normal'
    await nextTick()
    requestAnimationFrame(() => {
      if (appShellRef.value) appShellRef.value.classList.add('fade-in')
    })
    await delay(300)
    if (appShellRef.value) appShellRef.value.classList.remove('fade-in')
  }

  modeTransition.value = 'idle'
  resizePaused.value = false
  syncContentHeight()
}

async function toggleEdgeAutoHide() {
  const state = await window.api?.window.setEdgeAutoHide?.(!edgeAutoHide.value)
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
}

async function applyPreset(preset) {
  if ((preset.mode === 'mini' || preset.passThrough) && settingsOpen.value) closeSettings()
  const modeState = await window.api?.window.setMode?.(preset.mode)
  const opacityState = await window.api?.window.setOpacity?.(preset.opacity)
  const passState = await window.api?.window.setPassThrough?.(preset.passThrough)
  const state = passState || opacityState || modeState
  passThroughMode.value = Boolean(state?.passThrough ?? preset.passThrough)
  windowOpacity.value = Number(state?.opacity || preset.opacity)
  windowMode.value = state?.windowMode || preset.mode
  edgeAutoHide.value = Boolean(state?.edgeAutoHide)
  setTimeout(syncContentHeight, 80)
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

  const timeMatch = source.match(/(?:(上午|早上|下午|晚上)\s*(\d{1,2})(?:[:：点时](\d{1,2}))?|(\d{1,2})[:：点时](\d{1,2})?)/)
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
  if (e.key === 'Escape') {
    if (settingsOpen.value) {
      closeSettings()
      return
    }
    if (attachPopover.visible) {
      closeAttachPopover()
      return
    }
  }
}

function onMouseOut(e) {
  if (!e.relatedTarget) {
    window.api?.window.mouseLeave()
  }
}

function onMouseOver(e) {
  if (!e.relatedTarget) {
    window.api?.window.mouseEnter()
  }
}

onErrorCaptured((err) => {
  console.error('[App] uncaught error:', err)
  hasError.value = true
  return false
})

function syncContentHeight() {
  if (modeTransition.value !== 'idle') return
  const el = appShellRef.value
  if (!el) return

  const noteList = el.querySelector('.note-list')
  if (!noteList) return

  if (isMiniMode.value) {
    noteList.style.maxHeight = ''
    const dragBar = el.querySelector('.mini-drag-bar')
    const dragBarHeight = dragBar?.offsetHeight || 18
    const cards = noteList.querySelectorAll('.note-card')
    let cardsHeight = 0
    cards.forEach((card, i) => {
      if (i < 3) cardsHeight += card.offsetHeight
    })
    const gap = 6
    const padding = 10
    const totalHeight = dragBarHeight + cardsHeight + Math.max(0, Math.min(cards.length, 3) - 1) * gap + padding * 2
    window.api?.window.resizeToContent(totalHeight)
    return
  }

  const header = el.querySelector('.app-header')
  const toolbar = el.querySelector('.toolbar')
  const footer = el.querySelector('.app-footer')
  const usedHeight =
    (header?.offsetHeight || 0) +
    (toolbar?.offsetHeight || 0) +
    (footer?.offsetHeight || 0)
  const minWindowHeight = 360
  const screenMaxHeight = Math.max(minWindowHeight, (window.screen?.availHeight || window.innerHeight) - 80)
  const listContentHeight = noteList.scrollHeight
  const growsWithContent = notes.filteredNotes.length > 3
  const wantedHeight = growsWithContent
    ? Math.max(minWindowHeight, usedHeight + listContentHeight)
    : minWindowHeight
  const targetHeight = Math.min(screenMaxHeight, wantedHeight)
  const listMaxHeight = Math.max(96, targetHeight - usedHeight)

  noteList.style.maxHeight = `${Math.floor(listMaxHeight)}px`
  window.api?.window.resizeToContent(targetHeight)
}

function checkRemindersOnResume() {
  notes.checkReminders()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkRemindersOnResume()
  }
}

onMounted(async () => {
  setupSystemThemeListener()
  await loadCategories()
  await notes.load()
  await refreshInteractionState()
  await notes.requestNotificationPermission()
  checkRemindersOnResume()
  reminderTimer = setInterval(checkRemindersOnResume, 60000)

  if (window.api?.window.onFilterCategory) {
    unsubscribeHandlers.push(window.api.window.onFilterCategory((category) => notes.setFilter(category)))
  }
  if (window.api?.window.onCreateNote) {
    unsubscribeHandlers.push(window.api.window.onCreateNote(() => openEditor()))
  }
  if (window.api?.window.onInteractionState) {
    unsubscribeHandlers.push(
      window.api.window.onInteractionState((state) => {
        const wasMini = windowMode.value === 'mini'
        const wasPassThrough = passThroughMode.value
        passThroughMode.value = Boolean(state?.passThrough)
        windowOpacity.value = Number(state?.opacity || windowOpacity.value)
        windowMode.value = state?.windowMode || windowMode.value
        edgeAutoHide.value = Boolean(state?.edgeAutoHide)
        if (state?.theme) themePreference.value = state.theme
        if (settingsOpen.value) {
          const nowMini = windowMode.value === 'mini'
          const nowPassThrough = passThroughMode.value
          if ((!wasMini && nowMini) || (!wasPassThrough && nowPassThrough)) {
            window.api?.settingsWindow?.close()
          }
        }
      })
    )
  }

  if (window.api?.contextMenu?.onAction) {
    unsubscribeHandlers.push(window.api.contextMenu.onAction(handleContextMenuAction))
  }

  if (window.api?.settingsWindow?.onClosed) {
    unsubscribeHandlers.push(window.api.settingsWindow.onClosed(() => {
      settingsOpen.value = false
    }))
  }

  if (window.api?.notify?.onClick) {
    unsubscribeHandlers.push(window.api.notify.onClick(({ noteId }) => {
      if (!noteId) return
      const note = notes.notes.find(n => n.id === noteId)
      if (note) openEditor(note)
    }))
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mouseout', onMouseOut)
  document.addEventListener('mouseover', onMouseOver)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', checkRemindersOnResume)
  window.addEventListener('message', onPreloadFileDrop)
  window.addEventListener('resize', syncContentHeight)

  resizeObserver = new ResizeObserver(() => {
    if (resizePaused.value) return
    clearTimeout(resizeDebounce)
    resizeDebounce = setTimeout(syncContentHeight, 80)
  })
  if (appShellRef.value) {
    resizeObserver.observe(appShellRef.value)
  }
})

onBeforeUnmount(() => {
  unsubscribeHandlers.forEach((unsubscribe) => unsubscribe())
  clearInterval(reminderTimer)
  if (darkModeMq) darkModeMq.removeEventListener('change', () => {})
  clearTimeout(resizeDebounce)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mouseout', onMouseOut)
  document.removeEventListener('mouseover', onMouseOver)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('mousemove', onSortMouseMove)
  document.removeEventListener('mouseup', onSortMouseUp)
  window.removeEventListener('focus', checkRemindersOnResume)
  window.removeEventListener('message', onPreloadFileDrop)
  window.removeEventListener('resize', syncContentHeight)
})
</script>

<style scoped>
.app-shell {
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
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
  background: var(--bg-card);
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
  background: var(--bg-card);
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
  background: var(--bg-card);
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
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

.note-card.drag-over {
  border-color: rgba(47, 125, 120, 0.76);
  background: rgba(232, 247, 244, 0.96);
  box-shadow: inset 0 0 0 1px rgba(47, 125, 120, 0.22);
}

.sort-active .note-card {
  transition: transform 0.15s ease-out;
}

.note-card.sort-dragging {
  z-index: 100;
  box-shadow: var(--shadow-drag);
  cursor: grabbing;
}

.note-card.color-red { border-left: 3px solid #ef4444; }
.note-card.color-orange { border-left: 3px solid #f97316; }
.note-card.color-yellow { border-left: 3px solid #eab308; }
.note-card.color-green { border-left: 3px solid #22c55e; }
.note-card.color-blue { border-left: 3px solid #3b82f6; }
.note-card.color-purple { border-left: 3px solid #a855f7; }

.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.color-dot.dot-default { background: var(--border); }
.color-dot.dot-red { background: #ef4444; }
.color-dot.dot-orange { background: #f97316; }
.color-dot.dot-yellow { background: #eab308; }
.color-dot.dot-green { background: #22c55e; }
.color-dot.dot-blue { background: #3b82f6; }
.color-dot.dot-purple { background: #a855f7; }

.color-submenu .color-option {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-picker-row {
  display: flex;
  gap: 6px;
  padding: 4px 0;
}

.color-picker-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.color-picker-dot:hover { transform: scale(1.15); }
.color-picker-dot.active { border-color: var(--accent); }
.color-picker-dot.dot-default { background: var(--border); }
.color-picker-dot.dot-red { background: #ef4444; }
.color-picker-dot.dot-orange { background: #f97316; }
.color-picker-dot.dot-yellow { background: #eab308; }
.color-picker-dot.dot-green { background: #22c55e; }
.color-picker-dot.dot-blue { background: #3b82f6; }
.color-picker-dot.dot-purple { background: #a855f7; }

.sort-settling .note-card {
  transition: transform 0.22s ease-out;
}

.pass-through-mode .note-card:hover {
  border-color: var(--border);
  background: var(--bg-card);
}

.note-card.completed {
  opacity: 0.56;
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
  min-height: 190px;
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
  background: var(--bg-overlay);
}

.editor-panel {
  display: grid;
  width: min(100%, 360px);
  max-height: calc(100vh - 24px);
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
  border-radius: var(--radius-panel);
  background: var(--bg-elevated);
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
  background: var(--bg-input);
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

.md-editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-height: 160px;
}

.md-textarea {
  min-height: 160px !important;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px !important;
}

.md-editor-preview {
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  display: block !important;
  max-height: unset !important;
  overflow-y: auto !important;
  padding: 8px 10px !important;
  margin: 0 !important;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  font-size: 12px !important;
  line-height: 1.5 !important;
}

.md-editor-preview :where(p, div, h1, h2, h3, h4, h5, h6,
                          ul, ol, li, blockquote, pre, dl, dt, dd,
                          table, thead, tbody, tr, th, td) {
  display: block !important;
  margin: 0.3em 0 !important;
}

.md-editor-preview h1 { font-size: 16px; font-weight: 700; }
.md-editor-preview h2 { font-size: 14px; font-weight: 700; }
.md-editor-preview h3 { font-size: 13px; font-weight: 700; }
.md-editor-preview ul { padding-left: 1.4em; }
.md-editor-preview ol { padding-left: 1.4em; }
.md-editor-preview blockquote { border-left: 3px solid var(--accent); padding-left: 8px; margin-left: 0; }
.md-editor-preview pre { background: var(--accent-soft); padding: 6px 8px; border-radius: 4px; }
.md-editor-preview code { background: var(--accent-soft); padding: 1px 4px; border-radius: 3px; font-family: Consolas, Monaco, monospace; font-size: 11px; }

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
  background: var(--bg-input);
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
  background: var(--bg-input);
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
  background: var(--bg-input);
}

.primary-button {
  color: #fff;
  background: var(--accent);
}

.danger-button {
  color: #fff;
  background: var(--danger);
}

.mini-mode {
  grid-template-rows: auto auto;
}

.mini-mode .app-header {
  display: none;
}

.mini-drag-bar {
  height: 18px;
  -webkit-app-region: drag;
  cursor: grab;
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
  -webkit-line-clamp: unset;
}

.mini-mode .card-meta {
  display: none;
}

.note-card.color-red {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
}

.opacity-control {
  display: none;
}

.opacity-control input {
  width: 100%;
  accent-color: var(--accent);
}

.opacity-control span {
  font-size: 12px;
  text-align: right;
}

.preset-grid,
.category-grid,
.mode-switch {
  display: none;
}

.mode-switch button {
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.mode-switch button.active {
  border-color: rgba(47, 125, 120, 0.42);
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-weight: 700;
}

.edge-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.edge-toggle input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}

.error-fallback {
  display: grid;
  min-height: 100%;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.error-fallback p {
  margin: 0;
}

.error-fallback button {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 13px;
}

/* ===== 暗色模式适配 ===== */

.note-card.drag-over {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.mode-switch button {
  background: var(--bg-input);
}

.edge-toggle {
  background: var(--bg-input);
}

/* ===== 拖拽排序脉冲 ===== */

@keyframes sort-pulse {
  0%   { scale: 1; }
  18%  { scale: 0.94; }
  50%  { scale: 1.03; }
  100% { scale: 1; }
}

.note-card.sort-pulsed {
  animation: sort-pulse 0.2s ease-out;
}

/* ===== 卡片完成动画 ===== */

.note-card.completed strong,
.note-card.animating-completing strong,
.note-card.animating-incompleting strong {
  position: relative;
}

.note-card.completed strong::after,
.note-card.animating-completing strong::after,
.note-card.animating-incompleting strong::after {
  content: '';
  position: absolute;
  left: 0;
  top: calc(50% - 0.75px);
  width: 100%;
  height: 1.5px;
  background: currentColor;
  transform-origin: left center;
  pointer-events: none;
}

.note-card.completed strong::after {
  transform: scaleX(1);
}

.note-card.animating-completing {
  animation: cardFadeOut 0.45s ease-out forwards;
}
.note-card.animating-completing strong::after {
  animation: lineGrowIn 0.45s ease-out forwards;
}

.note-card.animating-incompleting {
  animation: cardFadeIn 0.45s ease-out forwards;
}
.note-card.animating-incompleting strong::after {
  animation: lineShrinkOut 0.45s ease-out forwards;
}

@keyframes cardFadeOut {
  from { opacity: 1; }
  to   { opacity: 0.56; }
}
@keyframes cardFadeIn {
  from { opacity: 0.56; }
  to   { opacity: 1; }
}
@keyframes lineGrowIn {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes lineShrinkOut {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* 移除旧的 text-decoration 完成样式，改用 ::after */
.note-card.completed strong {
  text-decoration: none;
}

/* ===== 模式切换动画 ===== */

.app-shell.mode-transitioning {
  pointer-events: none;
}

.app-shell.transition-to-mini .app-header,
.app-shell.transition-to-mini .toolbar,
.app-shell.transition-to-mini .app-footer {
  opacity: 0;
  transition: opacity 0.26s ease-out;
}

.app-shell.transition-to-mini .mini-drag-bar {
  opacity: 1;
  transition: opacity 0.26s ease-out 0.06s;
}

.app-shell.transition-to-normal .app-header,
.app-shell.transition-to-normal .toolbar,
.app-shell.transition-to-normal .app-footer {
  opacity: 0;
}

.app-shell.transition-to-normal.fade-in .app-header,
.app-shell.transition-to-normal.fade-in .toolbar,
.app-shell.transition-to-normal.fade-in .app-footer {
  opacity: 1;
  transition: opacity 0.26s ease-out;
}

.app-shell.transition-to-normal .mini-drag-bar {
  opacity: 0;
  transition: opacity 0.2s ease-out;
}

.mini-mode.mode-transitioning .app-header {
  display: flex;
}

.mini-mode.mode-transitioning .toolbar,
.mini-mode.mode-transitioning .app-footer {
  display: block;
}
</style>
