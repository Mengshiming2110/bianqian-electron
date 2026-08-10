<template>
  <main v-if="!hasError" class="app-shell app-frame" :class="{ 'pass-through-mode': passThroughMode }">
    <header class="app-header">
      <div class="header-row">
        <div class="app-heading">
          <h1 class="page-title">{{ tabMeta.title }}</h1>
          <p class="page-subtitle">{{ tabMeta.subtitle }}</p>
        </div>
        <div class="header-actions">
          <button v-if="activeTab === 'notes'" class="btn-new" type="button" title="新建备忘" @click="openEditor()">
            <Plus :size="16" />
            <span>新建</span>
          </button>
          <button v-if="activeTab === 'clipboard'" class="clear-btn" type="button" title="清空剪切板" @click="handleClearAllClipboard">
            清空
          </button>
          <span v-if="activeTab === 'mail'" class="status-pill" :class="{ off: !mailOnline }">
            <span class="status-dot" :class="mailOnline ? 'on' : 'off'"></span>
            {{ mailStatusLabel }}
          </span>
          <button class="icon-btn" title="隐藏窗口" type="button" @click="hideWindow"><Minus :size="16" /></button>
        </div>
      </div>
    </header>

    <div class="app-content">
      <div v-show="activeTab === 'notes'" class="tab-pane notes-pane">
        <label class="search-field">
          <Search :size="16" class="search-icon" aria-hidden="true" />
          <input
            class="search-input"
            type="search"
            :value="notes.search"
            :placeholder="searchPlaceholder"
            @input="notes.setSearch($event.target.value)"
            @keydown.enter="handleSearchEnter"
          />
        </label>

        <div class="category-chips" role="group" aria-label="分类筛选">
          <button
            v-for="cat in allCategoryList"
            :key="cat"
            class="chip"
            :data-active="notes.activeCategory === cat"
            type="button"
            @click="notes.setFilter(cat)"
          >{{ cat }}</button>
        </div>

        <section class="note-list" :class="{ 'sort-active': sortDrag.active, 'sort-settling': sortDrag.settling }" aria-label="备忘列表">
          <article
            v-for="note in displayedNotes"
            :key="note.id"
            :data-note-id="note.id"
            class="note-card"
            :class="{
              completed: note.completed,
              'is-done': note.completed,
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
            <div class="note-head">
              <h3 class="note-title">{{ note.title }}</h3>
              <div class="note-head-right">
                <span
                  v-if="note.attachments.length"
                  class="attach-pill"
                  @click.stop="openAttachPopover(note, $event)"
                >
                  <Paperclip :size="10" />
                  {{ note.attachments.length }}
                </span>
                <span class="note-tag">{{ note.category }}</span>
              </div>
            </div>
            <MarkdownPreview v-if="note.content" :content="note.content" :is-mini="false" @link-click="openExternalLink" />
            <div class="note-actions">
              <button class="icon-btn" title="弹出" type="button" @click.stop="popOutNote(note)">
                <ExternalLink :size="16" />
              </button>
              <button
                class="icon-btn"
                :class="{ pinned: note.pinned }"
                :title="note.pinned ? '取消置顶' : '置顶备忘'"
                type="button"
                @click.stop="notes.togglePinned(note.id)"
              >
                <Pin :size="16" />
              </button>
              <button class="icon-btn" :class="{ done: note.completed }" title="切换完成状态" type="button" @click.stop="handleToggleCompleted(note.id)">
                <CheckCircle :size="16" />
              </button>
              <button class="icon-btn" title="编辑" type="button" @click.stop="openEditor(note)">
                <PencilLine :size="16" />
              </button>
            </div>
          </article>

          <div v-if="!notes.filteredNotes.length" class="empty-state">
            <span class="empty-icon"><StickyNote :size="28" /></span>
            <p class="empty-title">还没有备忘</p>
            <p class="empty-hint">点击右上角 + 新建，或输入「明天9点交报告 #工作」快速创建</p>
          </div>
        </section>
      </div>

      <ClipboardPanel v-if="activeTab === 'clipboard'" class="tab-pane" />
      <MailPanel v-if="activeTab === 'mail'" class="tab-pane" />
      <SettingsPanel v-if="activeTab === 'settings'" class="tab-pane settings-pane" @close="hideWindow" @theme-change="themePreference = $event" />
    </div>

    <footer class="app-footer"><span>{{ todayLabel }}</span></footer>

    <nav class="app-tabbar" aria-label="主导航">
      <div class="app-tabbar-inner">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :data-active="activeTab === tab.id"
          :data-tab-key="tab.id"
          type="button"
          @click="switchTab(tab.id)"
        >
          <component :is="tabIcons[tab.id]" class="tab-icon" />
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </div>
    </nav>

    <button class="peel-btn" type="button" title="收起窗口" aria-label="收起窗口" @click="hideWindow"><ChevronUp :size="18" /></button>

    <div v-if="editorOpen" class="editor-overlay" @click.self="closeEditor">
      <form class="editor-panel" @submit.prevent="saveEditor">
        <header class="editor-header">
          <h2>{{ draft.id ? '编辑备忘' : '新建备忘' }}</h2>
          <button class="icon-btn" title="关闭" type="button" @click="closeEditor">
            <X :size="18" />
          </button>
        </header>

        <div class="panel-body">
          <label class="field full">
            <span>标题</span>
            <input v-model.trim="draft.title" type="text" autofocus required @keydown.enter.prevent="saveEditor" />
          </label>

          <div class="field-grid">
            <label class="field">
              <span>分类</span>
              <SelectMenu
                v-model="draft.category"
                :options="categoryOptions"
              />
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
              <DatePicker v-model="draft.date" />
            </label>
            <label class="field">
              <span>时间</span>
              <TimePicker v-model="draft.time" />
            </label>
          </div>

          <div class="remind-toggle">
            <span>提醒</span>
            <input v-model="draft.remind" type="checkbox" class="switch" />
          </div>

          <label class="field full">
            <span>备注</span>
            <textarea v-model="draft.content" rows="6" class="md-textarea"></textarea>
          </label>

          <section class="attachments">
            <button class="btn-secondary" type="button" @click="pickAttachments">
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
        </div>

        <footer class="editor-actions">
          <button v-if="draft.id" class="btn-danger" type="button" @click="deleteEditorNote">
            <Trash2 :size="15" />
            删除
          </button>
          <span></span>
          <button class="btn-secondary" type="button" @click="closeEditor">取消</button>
          <button class="btn-primary" type="submit">
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

    <WelcomeCard />
    <AboutCard ref="aboutRef" />
  </main>

  <div v-if="hasError" class="error-fallback">
    <div class="error-context">
      <span>{{ tabEyebrow }}</span>
      <time>{{ todayLabel }}</time>
    </div>
    <div class="error-panel-wrap">
      <div class="error-panel">
        <span class="error-icon"><StickyNote :size="26" /></span>
        <h2>界面临时失去响应</h2>
        <p>数据仍保存在本机。重试会回到当前窗口，不会清空备忘、剪切板或邮箱配置。</p>
        <div class="error-actions">
          <button type="button" class="btn-primary" @click="hasError = false">重试</button>
          <button type="button" class="btn-secondary" @click="hideWindow">先隐藏</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onErrorCaptured, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import {
  CheckCircle,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  Mail,
  Minus,
  Paperclip,
  PencilLine,
  Pin,
  Plus,
  Save,
  Search,
  Settings,
  StickyNote,
  Trash2,
  X
} from 'lucide-vue-next'
import AttachmentPopover from './components/AttachmentPopover.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import { CATEGORIES, ALL_CATEGORY, MAX_ATTACHMENTS_PER_NOTE, loadCategories, useNotesStore } from './stores/notes'
import { useClipboardStore } from './stores/clipboard'
import { useMailStore } from './stores/mail'
import ClipboardPanel from './components/ClipboardPanel.vue'
import MailPanel from './components/MailPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import WelcomeCard from './components/WelcomeCard.vue'
import AboutCard from './components/AboutCard.vue'
import SelectMenu from './components/SelectMenu.vue'
import DatePicker from './components/DatePicker.vue'
import TimePicker from './components/TimePicker.vue'
import { fileName } from './lib/format'

const notes = useNotesStore()
const clipboardStore = useClipboardStore()
const mailStore = useMailStore()

const activeTab = ref('notes')
const tabs = [
  { id: 'notes', label: '便签' },
  { id: 'clipboard', label: '剪切板' },
  { id: 'mail', label: '邮件' },
  { id: 'settings', label: '设置' }
]
const tabIcons = { notes: StickyNote, clipboard: ClipboardList, mail: Mail, settings: Settings }
const aboutRef = ref(null)

const searchPlaceholder = '搜索，或输入：明天9点交报告 #工作'

const tabMeta = computed(() => {
  const map = {
    notes: {
      title: '便签',
      subtitle: notes.activeCategory === ALL_CATEGORY
        ? `${notes.filteredNotes.length} 条记录`
        : `${notes.activeCategory} · ${notes.filteredNotes.length} 条`
    },
    clipboard: {
      title: '剪切板',
      subtitle: `${clipboardStore.items.length} 条记录 · 本地保存`
    },
    mail: {
      title: '邮件',
      subtitle: mailStore.connected ? 'Exchange 已连接' : (mailStore.configured ? '连接中…' : '未连接邮箱')
    },
    settings: { title: '设置', subtitle: '个性化与系统选项' }
  }
  return map[activeTab.value]
})

const mailOnline = computed(() => Boolean(mailStore.connected || mailStore.isRunning))
const mailStatusLabel = computed(() => {
  if (mailStore.connected) return '已连接'
  if (mailStore.isRunning) return '同步中'
  return '未连接'
})

function switchTab(id) { activeTab.value = id }
function onNavigateTab(tab) { activeTab.value = tab }
function onShowAbout() { aboutRef.value?.show() }
function onTogglePassThrough() { togglePassThrough() }
const noteColors = [
  { value: '', label: '默认' },
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' }
]
const editorOpen = ref(false)
watch(editorOpen, (val) => {
  window.api?.window.setEditing(val)
})
const passThroughMode = ref(false)
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

const animatingCardIds = reactive(new Map())
const hasError = ref(false)
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
let lastFileDropKey = ''
let lastFileDropAt = 0
let originalDraftAttachments = []
let sortDragJustEndedTimer = null
let sortDragSettlingTimer = null
let toggleCompletedTimer = null

const draft = reactive(defaultDraft())

const attachPopover = reactive({
  visible: false,
  note: null,
  anchorEl: null
})

const displayedNotes = computed(() => notes.filteredNotes)
const allCategoryList = computed(() => [ALL_CATEGORY, ...CATEGORIES])
const categoryOptions = computed(() => CATEGORIES.map((category) => ({ value: category, label: category })))
const tabEyebrow = computed(() => {
  if (activeTab.value === 'notes') return notes.activeCategory
  if (activeTab.value === 'clipboard') return '剪切板工具'
  return '邮件工具'
})

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
    try {
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
          await notes.reorderNote(sortDrag.noteId, targetId, position)
        }
      }
    } catch (err) {
      console.error('[App] sort reorder failed:', err)
    } finally {
      sortDragJustEnded.value = true
      clearTimeout(sortDragJustEndedTimer)
      sortDragJustEndedTimer = setTimeout(() => { sortDragJustEnded.value = false }, 100)

      sortDrag.settling = true
      sortDrag.shifts = {}
      sortDrag.pulsed = {}
      Object.values(pulseCleanupTimers).forEach(clearTimeout)
      pulseCleanupTimers = {}
      clearTimeout(sortDragSettlingTimer)
      sortDragSettlingTimer = setTimeout(() => {
        sortDrag.active = false
        sortDrag.settling = false
        sortDrag.noteId = ''
        sortDrag.shifts = {}
        sortDrag.deltaY = 0
        sortDragStarted = false
      }, 280)
    }
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
  try {
    window.api?.contextMenu?.show({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      color: note.color,
      pinned: note.pinned,
      completed: note.completed
    })
  } catch (err) {
    console.error('[App] openContextMenu failed:', err)
  }
}

function handleContextMenuAction({ action, noteId, value }) {
  try {
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
  } catch (err) {
    console.error('[App] handleContextMenuAction failed:', err)
  }
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
  try {
    await notes.toggleCompleted(noteId)
    await nextTick()
  } catch (err) {
    console.error('[App] toggleCompleted failed:', err)
  } finally {
    clearTimeout(toggleCompletedTimer)
    toggleCompletedTimer = setTimeout(() => {
      if (animatingCardIds.get(noteId) === animKey) animatingCardIds.delete(noteId)
    }, 500)
  }
}

let onDarkModeChange = null
function setupSystemThemeListener() {
  darkModeMq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = darkModeMq.matches
  onDarkModeChange = (e) => { systemDark.value = e.matches }
  darkModeMq.addEventListener('change', onDarkModeChange)
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
  try {
    if (options?.cleanup !== false) {
      await cleanupUnusedCopies(draft.attachments, originalDraftAttachments)
    }
  } catch (err) {
    console.error('[App] closeEditor cleanup failed:', err)
  } finally {
    editorOpen.value = false
    Object.assign(draft, defaultDraft())
    originalDraftAttachments = []
  }
}

async function saveEditor() {
  if (!draft.title.trim()) {
    return
  }

  const payload = JSON.parse(JSON.stringify(draft))

  try {
    if (draft.id) {
      const saved = await notes.update(draft.id, payload)
      await cleanupUnusedCopies([...originalDraftAttachments, ...payload.attachments], saved.attachments)
    } else {
      const saved = await notes.create(payload)
      await cleanupUnusedCopies(payload.attachments, saved.attachments)
    }
  } catch (err) {
    console.error('[App] saveEditor failed:', err)
    return
  }

  await closeEditor({ cleanup: false })
}

async function deleteEditorNote() {
  if (!draft.id || !confirm('删除这条备忘？')) {
    return
  }

  try {
    await notes.delete(draft.id)
  } catch (err) {
    console.error('[App] deleteEditorNote failed:', err)
    return
  }
  await closeEditor({ cleanup: false })
}

async function pickAttachments() {
  const remaining = remainingAttachmentSlots(draft.attachments)
  console.info('[attachments] editor pick click', { remaining, hasApi: Boolean(window.api?.files?.selectAttachments) })
  if (remaining <= 0) return

  try {
    const files = await notes.chooseAttachments(remaining)
    console.info('[attachments] editor pick result', { count: files?.length || 0, files })
    draft.attachments = mergeAttachments(draft.attachments, files)
    await cleanupUnusedCopies(files, draft.attachments)
  } catch (err) {
    console.error('[App] pickAttachments failed:', err)
  }
}

async function removeAttachment(file) {
  draft.attachments = draft.attachments.filter((item) => item !== file)
  if (!originalDraftAttachments.includes(file)) {
    await notes.cleanupAttachments([file])
  }
}

function hideWindow() {
  window.api?.window.hide()
}

function openExternalLink(url) {
  window.api?.files?.openExternal(url)
}

async function handleClearAllClipboard() {
  if (!clipboardStore.items.length) return
  if (!confirm('确定清空所有未固定的剪切板记录？')) return
  await clipboardStore.clearAll()
}

async function refreshInteractionState() {
  const state = await window.api?.window.getInteractionState?.()
  passThroughMode.value = Boolean(state?.passThrough)
  if (state?.theme) themePreference.value = state.theme
}

async function togglePassThrough() {
  const state = await window.api?.window.setPassThrough?.(!passThroughMode.value)
  passThroughMode.value = Boolean(state?.passThrough)
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
  try {
    await loadCategories()
  } catch (err) {
    console.error('[App] loadCategories failed:', err)
  }
  try {
    await notes.load()
  } catch (err) {
    console.error('[App] notes.load failed:', err)
  }
  try {
    await refreshInteractionState()
  } catch (err) {
    console.error('[App] refreshInteractionState failed:', err)
  }
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
        passThroughMode.value = Boolean(state?.passThrough)
        if (state?.theme) themePreference.value = state.theme
      })
    )
  }

  if (window.api?.contextMenu?.onAction) {
    unsubscribeHandlers.push(window.api.contextMenu.onAction(handleContextMenuAction))
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

  // Tab navigation from tray
  if (window.api?.events?.on) {
    unsubscribeHandlers.push(window.api.events.on('navigate-tab', onNavigateTab))
    unsubscribeHandlers.push(window.api.events.on('show-about', onShowAbout))
    unsubscribeHandlers.push(window.api.events.on('toggle-pass-through', onTogglePassThrough))
  }

  // Load clipboard + mail on mount
  clipboardStore.load()
  mailStore.load()
})

onBeforeUnmount(() => {
  unsubscribeHandlers.forEach((unsubscribe) => unsubscribe())
  clearInterval(reminderTimer)
  if (darkModeMq && onDarkModeChange) darkModeMq.removeEventListener('change', onDarkModeChange)
  cancelSortDrag()
  clearTimeout(sortDragJustEndedTimer)
  clearTimeout(sortDragSettlingTimer)
  clearTimeout(toggleCompletedTimer)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mouseout', onMouseOut)
  document.removeEventListener('mouseover', onMouseOver)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('mousemove', onSortMouseMove)
  document.removeEventListener('mouseup', onSortMouseUp)
  window.removeEventListener('focus', checkRemindersOnResume)
  window.removeEventListener('message', onPreloadFileDrop)
})
</script>

<style scoped>
/* ===== 窗口外壳（透明无边框圆角窗口）===== */
.app-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-window);
  background: var(--bg-window);
  box-shadow: var(--shadow);
  clip-path: inset(0 round var(--radius-window));
  isolation: isolate;
}

/* ===== 内容区 ===== */
.app-content {
  scroll-behavior: smooth;
}

.tab-pane {
  min-width: 0;
}

.notes-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notes-pane .search-field {
  margin-bottom: 0;
}

.category-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.category-chips::-webkit-scrollbar {
  display: none;
}

.note-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.note-card {
  flex: 0 0 auto;
  cursor: pointer;
}

.note-card:active {
  transform: scale(0.99);
}

.note-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  justify-self: end;
}

.attach-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 7px;
  border-radius: var(--radius-full);
  color: var(--apple-primary);
  background: var(--brand-soft);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  flex: none;
}

/* 颜色卡片 */
.note-card.color-red { border-color: color-mix(in srgb, var(--note-red) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-red)); }
.note-card.color-orange { border-color: color-mix(in srgb, var(--note-orange) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-orange)); }
.note-card.color-yellow { border-color: color-mix(in srgb, var(--note-yellow) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-yellow)); }
.note-card.color-green { border-color: color-mix(in srgb, var(--note-green) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-green)); }
.note-card.color-blue { border-color: color-mix(in srgb, var(--note-blue) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-blue)); }
.note-card.color-purple { border-color: color-mix(in srgb, var(--note-purple) 38%, transparent); background: color-mix(in srgb, var(--apple-card) 92%, var(--note-purple)); }

/* 完成态 */
.note-card.completed {
  opacity: 0.56;
}

.note-card.is-done .note-title {
  text-decoration: line-through;
}

/* 拖拽排序 */
.drag-over {
  border-color: var(--border-brand);
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1px var(--border-brand);
}

.sort-active .note-card {
  transition: transform 0.15s ease-out;
}

.note-card.sort-dragging {
  z-index: 100;
  box-shadow: var(--shadow-drag);
  cursor: grabbing;
}

.sort-settling .note-card {
  transition: transform 0.22s ease-out;
}

@keyframes sort-pulse {
  0%   { scale: 1; }
  18%  { scale: 0.94; }
  50%  { scale: 1.03; }
  100% { scale: 1; }
}

.note-card.sort-pulsed {
  animation: sort-pulse 0.2s ease-out;
}

/* 完成动画 */
.note-card.animating-completing {
  animation: cardFadeOut 0.25s ease-out forwards;
}

.note-card.animating-incompleting {
  animation: cardFadeIn 0.25s ease-out forwards;
}

@keyframes cardFadeOut {
  from { opacity: 1; }
  to   { opacity: 0.56; }
}

@keyframes cardFadeIn {
  from { opacity: 0.56; }
  to   { opacity: 1; }
}

/* ===== 便签编辑器弹层（原型 note-editor）===== */
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 12px;
  background: color-mix(in srgb, var(--apple-foreground) 42%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  clip-path: inset(0 round var(--radius-window));
  animation: fade var(--dur-base) var(--ease-out);
}

.editor-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 400px);
  max-height: calc(100vh - 24px);
  overflow: hidden;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  box-shadow: var(--shadow-xl);
  animation: rise var(--dur-base) var(--ease-spring);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--apple-border);
}

.editor-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 14px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field.full {
  grid-column: 1 / -1;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
}

.color-picker-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  background-clip: padding-box;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}

.color-picker-dot.active { border-color: var(--apple-ring); }
.color-picker-dot.dot-default { background: var(--border-strong); }
.color-picker-dot.dot-red { background: var(--note-red); }
.color-picker-dot.dot-orange { background: var(--note-orange); }
.color-picker-dot.dot-yellow { background: var(--note-yellow); }
.color-picker-dot.dot-green { background: var(--note-green); }
.color-picker-dot.dot-blue { background: var(--note-blue); }
.color-picker-dot.dot-purple { background: var(--note-purple); }

.remind-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-background);
  font-size: 13px;
  color: var(--apple-foreground);
}

.md-textarea {
  min-height: 140px;
  font-family: var(--font-mono);
  font-size: 12px;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-sm);
  color: var(--apple-muted-foreground);
  background: var(--apple-background);
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
  padding: 12px 16px 14px;
  border-top: 1px solid var(--apple-border);
  background: var(--apple-muted);
}

/* ===== 错误回退（原型 error-fallback）===== */
.error-fallback {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 20px 20px 24px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-window);
  background:
    radial-gradient(120% 65% at 50% -12%, color-mix(in srgb, var(--apple-primary) 9%, transparent), transparent 58%),
    var(--bg-window);
  box-shadow: var(--shadow);
  clip-path: inset(0 round var(--radius-window));
}

.error-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
}

.error-panel-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
}

.error-panel {
  width: 100%;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 28px 22px 22px;
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--apple-card) 86%, transparent);
  box-shadow: var(--shadow-xl);
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--apple-primary);
}

.error-panel h2,
.error-panel p {
  margin: 0;
}

.error-panel h2 {
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.error-panel p {
  max-width: 240px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.error-actions .btn-primary,
.error-actions .btn-secondary {
  min-width: 96px;
  height: 36px;
}

/* ===== 穿透模式 ===== */
.pass-through-mode .note-card:hover {
  transform: none;
  box-shadow: none;
}

@media (hover: hover) and (pointer: fine) {
  .attach-pill:hover {
    background: var(--brand-soft-strong);
  }

  .color-picker-dot:hover {
    transform: scale(1.15);
  }
}
</style>
