import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { CATEGORIES, normalizeCategory } from './categories.js'

let backingStore
const STORE_NAME = '领益工作助手数据'
const LEGACY_STORE_NAME = '便签数据'
const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const DEFAULT_MAIL_DOMAIN = 'LSTECH'

function createStore(name = STORE_NAME) {
  return new Store({
    name,
    clearInvalidConfig: true,
    encryptionKey: 'bianqian-electron-store-v1',
    defaults: {
      notes: [],
      settings: {
        opacity: 0.92,
        defaultCat: '',
        clipboardLimit: 50,
        autoStart: false,
        mailInterval: 5,
        mailConfig: { server: DEFAULT_MAIL_SERVER, email: '', domainUser: '', domain: DEFAULT_MAIL_DOMAIN },
        windowMode: 'normal',
        edgeAutoHide: false,
        theme: 'system',
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
  })
}

function migrateLegacyStore(store) {
  if (store.has('notes') || store.has('settings')) return

  try {
    const legacy = createStore(LEGACY_STORE_NAME)
    if (legacy.has('notes')) {
      store.set('notes', legacy.get('notes', []))
    }
    if (legacy.has('settings')) {
      store.set('settings', legacy.get('settings', {}))
    }
  } catch (error) {
    console.warn('[store] legacy migration skipped:', error?.message || error)
  }
}

function getBackingStore() {
  if (!backingStore) {
    backingStore = createStore()
    migrateLegacyStore(backingStore)
  }
  return backingStore
}

function today() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeTime(value) {
  return /^\d{2}:\d{2}$/.test(value || '') ? value : '09:00'
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : today()
}

export function generateId() {
  return randomUUID()
}

export function normalizeNote(input = {}) {
  const createdAt = input.createdAt || new Date().toISOString()

  const validColors = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']
  return {
    id: String(input.id || generateId()),
    title: String(input.title || '').trim(),
    content: String(input.content || ''),
    category: normalizeCategory(input.category),
    date: normalizeDate(input.date),
    time: normalizeTime(input.time),
    completed: Boolean(input.completed),
    pinned: Boolean(input.pinned),
    remind: input.remind !== false,
    color: validColors.includes(input.color) ? input.color : '',
    order: typeof input.order === 'number' ? input.order : Date.now(),
    attachments: Array.isArray(input.attachments)
      ? input.attachments.map((item) => String(item))
      : [],
    createdAt
  }
}

export function getNotes() {
  const notes = getBackingStore().get('notes', [])
  return Array.isArray(notes) ? notes.map(normalizeNote) : []
}

export function saveNotes(notes) {
  const normalized = Array.isArray(notes) ? notes.map(normalizeNote) : []
  getBackingStore().set('notes', normalized)
  return normalized
}

export function createNote(input) {
  const note = normalizeNote({ ...input, id: generateId(), createdAt: new Date().toISOString() })

  if (!note.title) {
    throw new Error('标题不能为空')
  }

  const notes = getNotes()
  notes.unshift(note)
  saveNotes(notes)
  return note
}

export function updateNote(id, patch) {
  const notes = getNotes()
  const index = notes.findIndex((note) => note.id === String(id))

  if (index === -1) {
    throw new Error('备忘不存在')
  }

  const nextNote = normalizeNote({ ...notes[index], ...patch, id: notes[index].id, createdAt: notes[index].createdAt })

  if (!nextNote.title) {
    throw new Error('标题不能为空')
  }

  notes.splice(index, 1, nextNote)
  saveNotes(notes)
  return nextNote
}

export function deleteNote(id) {
  const nextNotes = getNotes().filter((note) => note.id !== String(id))
  saveNotes(nextNotes)
  return nextNotes
}

export function toggleNote(id) {
  const notes = getNotes()
  const note = notes.find((item) => item.id === String(id))

  if (!note) {
    throw new Error('备忘不存在')
  }

  return updateNote(id, { completed: !note.completed })
}

export function countByCategory(notes = getNotes()) {
  return CATEGORIES.reduce((result, category) => {
    result[category] = notes.filter((note) => note.category === category).length
    return result
  }, {})
}

function clampOpacity(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 0.92
  }

  return Math.min(1, Math.max(0.35, number))
}

const DEFAULT_SHORTCUTS = {
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

export function getSettings() {
  const settings = getBackingStore().get('settings', {})

  return {
    opacity: clampOpacity(settings.opacity),
    defaultCat: settings.defaultCat || '',
    clipboardLimit: typeof settings.clipboardLimit === 'number' ? settings.clipboardLimit : 50,
    autoStart: Boolean(settings.autoStart),
    mailInterval: typeof settings.mailInterval === 'number' ? settings.mailInterval : 5,
    mailConfig: normalizeMailConfig(settings.mailConfig),
    windowMode: 'normal',
    edgeAutoHide: Boolean(settings.edgeAutoHide),
    theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'system',
    shortcuts: {
      ...DEFAULT_SHORTCUTS,
      ...(settings.shortcuts || {})
    }
  }
}

function normalizeMailConfig(config) {
  const mailConfig = config && typeof config === 'object' ? config : {}
  return {
    server: String(mailConfig.server || DEFAULT_MAIL_SERVER).trim() || DEFAULT_MAIL_SERVER,
    email: String(mailConfig.email || '').trim(),
    domainUser: String(mailConfig.domainUser || mailConfig.username || '').trim(),
    domain: String(mailConfig.domain || DEFAULT_MAIL_DOMAIN).trim() || DEFAULT_MAIL_DOMAIN,
    password: ''
  }
}

export function updateSettings(patch = {}) {
  const nextSettings = {
    ...getSettings(),
    ...patch
  }

  nextSettings.opacity = clampOpacity(nextSettings.opacity)
  getBackingStore().set('settings', nextSettings)
  return nextSettings
}

export function getShortcuts() {
  return getSettings().shortcuts
}

export function setShortcut(id, binding) {
  const shortcuts = { ...getShortcuts() }
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
  updateSettings({ shortcuts: { ...DEFAULT_SHORTCUTS } })
  return getShortcuts()
}
