import { defineStore } from 'pinia'

const api = window.api
const localStorageKey = 'bianqian-notes'
const MAX_ATTACHMENTS_PER_NOTE = 10

let CATEGORIES = ['工作', '生活', '学习', '会议', '其他']
let ALL_CATEGORY = '全部'

export { CATEGORIES, ALL_CATEGORY, MAX_ATTACHMENTS_PER_NOTE }

export async function loadCategories() {
  if (!api?.categories) return
  try {
    const result = await api.categories.list()
    if (result?.categories?.length) {
      CATEGORIES.splice(0, CATEGORIES.length, ...result.categories)
    }
    if (result?.allCategory) {
      ALL_CATEGORY = result.allCategory
    }
  } catch {}
}

function today() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeNote(input = {}) {
  return {
    id: String(input.id || ''),
    title: String(input.title || '').trim(),
    content: String(input.content || ''),
    category: CATEGORIES.includes(input.category) ? input.category : '其他',
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : today(),
    time: /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '09:00',
    completed: Boolean(input.completed),
    pinned: Boolean(input.pinned),
    remind: input.remind !== false,
    attachments: Array.isArray(input.attachments)
      ? [...new Set(input.attachments.map(String))].slice(0, MAX_ATTACHMENTS_PER_NOTE)
      : [],
    createdAt: input.createdAt || new Date().toISOString(),
    order: typeof input.order === 'number' ? input.order : Date.now()
  }
}

function fallbackLoad() {
  try {
    return JSON.parse(localStorage.getItem(localStorageKey) || '[]').map(normalizeNote)
  } catch {
    return []
  }
}

function fallbackSave(notes) {
  localStorage.setItem(localStorageKey, JSON.stringify(notes))
}

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [],
    activeCategory: ALL_CATEGORY,
    search: '',
    reminderHistory: new Set()
  }),
  getters: {
    categoryCounts: (state) =>
      CATEGORIES.reduce((result, category) => {
        result[category] = state.notes.filter((note) => note.category === category).length
        return result
      }, {}),
    filteredNotes(state) {
      const keyword = state.search.trim().toLowerCase()

      return state.notes
        .filter((note) => state.activeCategory === ALL_CATEGORY || note.category === state.activeCategory)
        .filter((note) => {
          if (!keyword) {
            return true
          }

          return `${note.title} ${note.content}`.toLowerCase().includes(keyword)
        })
        .sort((a, b) => {
          if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1
          }
          return a.order - b.order
        })
    }
  },
  actions: {
    async load() {
      this.notes = api ? await api.notes.list() : fallbackLoad()
      this.syncTrayCounts()
    },
    setFilter(category) {
      this.activeCategory = category === ALL_CATEGORY || CATEGORIES.includes(category) ? category : ALL_CATEGORY
    },
    setSearch(value) {
      this.search = value
    },
    async create(note) {
      const payload = normalizeNote(note)
      const saved = api ? await api.notes.create(payload) : { ...payload, id: Date.now().toString() }
      this.notes.unshift(normalizeNote(saved))
      this.persistFallback()
      this.syncTrayCounts()
      return saved
    },
    async update(id, patch) {
      const updated = api ? await api.notes.update(id, patch) : normalizeNote({ ...this.notes.find((note) => note.id === id), ...patch })
      const index = this.notes.findIndex((note) => note.id === String(id))

      if (index !== -1) {
        this.notes.splice(index, 1, normalizeNote(updated))
      }

      this.persistFallback()
      this.syncTrayCounts()
      return updated
    },
    async delete(id) {
      if (api) {
        await api.notes.delete(id)
      }

      this.notes = this.notes.filter((note) => note.id !== String(id))
      this.persistFallback()
      this.syncTrayCounts()
    },
    async toggleCompleted(id) {
      const updated = api
        ? await api.notes.toggle(id)
        : normalizeNote({
            ...this.notes.find((note) => note.id === id),
            completed: !this.notes.find((note) => note.id === id)?.completed
          })

      const index = this.notes.findIndex((note) => note.id === String(id))

      if (index !== -1) {
        this.notes.splice(index, 1, normalizeNote(updated))
      }

      this.persistFallback()
      this.syncTrayCounts()
    },
    async togglePinned(id) {
      const note = this.notes.find((item) => item.id === String(id))
      if (!note) {
        return
      }

      await this.update(id, { pinned: !note.pinned })
    },
    async reorderNote(fromId, toId, position = 'before') {
      const fromIndex = this.notes.findIndex((n) => n.id === String(fromId))
      let toIndex = this.notes.findIndex((n) => n.id === String(toId))
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

      const [moved] = this.notes.splice(fromIndex, 1)
      toIndex = this.notes.findIndex((n) => n.id === String(toId))
      if (position === 'after') toIndex += 1
      this.notes.splice(toIndex, 0, moved)

      const start = Math.min(fromIndex, toIndex)
      const end = Math.max(fromIndex, toIndex)
      const updates = []
      for (let i = start; i <= end; i++) {
        this.notes[i].order = i
        updates.push({ id: this.notes[i].id, order: i })
      }

      if (api) {
        for (const u of updates) {
          await api.notes.update(u.id, { order: u.order })
        }
      }
      this.persistFallback()
    },
    async chooseAttachments(limit = MAX_ATTACHMENTS_PER_NOTE) {
      return api ? api.files.selectAttachments(limit) : []
    },
    async importAttachments(paths, limit = MAX_ATTACHMENTS_PER_NOTE) {
      return api ? api.files.importAttachments(paths, limit) : []
    },
    filePathsFromDrop(files) {
      return api ? api.files.pathsFromFiles(files) : []
    },
    async cleanupAttachments(paths) {
      if (api) {
        await api.files.cleanupAttachments(paths)
      }
    },
    async openAttachment(path) {
      if (api) {
        await api.files.openPath(path)
      }
    },
    async requestNotificationPermission() {
      if (!('Notification' in window) || Notification.permission !== 'default') {
        return
      }

      await Notification.requestPermission()
    },
    checkReminders() {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        return
      }

      const now = Date.now()

      this.notes
        .filter((note) => note.remind && !note.completed)
        .forEach((note) => {
          const dueAt = new Date(`${note.date}T${note.time}:00`).getTime()
          const diff = dueAt - now
          const key = `${note.id}:${note.date}:${note.time}`

          if (diff <= 0 && !this.reminderHistory.has(key)) {
            this.reminderHistory.add(key)
            new Notification(note.title, {
              body: note.content || `${note.category} · ${note.time}`
            })
          }
        })
    },
    syncTrayCounts() {
      api?.tray.updateCounts(this.categoryCounts)
    },
    persistFallback() {
      if (!api) {
        fallbackSave(this.notes)
      }
    }
  }
})
