import { defineStore } from 'pinia'

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    items: [],
    searchQuery: '',
    selectMode: false,
    selectedIds: new Set()
  }),

  getters: {
    filteredItems(state) {
      let list = [...state.items].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.last_copied_at) - new Date(a.last_copied_at)
      })
      if (state.searchQuery.trim()) {
        const q = state.searchQuery.toLowerCase()
        list = list.filter(item =>
          (item.preview || item.content || '').toLowerCase().includes(q)
        )
      }
      return list
    }
  },

  actions: {
    async load() {
      this.items = await window.api.clipboard.list(100, 0) || []
    },

    async search(query) {
      this.searchQuery = query || ''
    },

    async deleteItem(id) {
      await window.api.clipboard.delete(id)
      this.items = this.items.filter(item => item.id !== id)
      this.selectedIds.delete(id)
    },

    async togglePin(id) {
      await window.api.clipboard.togglePin(id)
      const item = this.items.find(item => item.id === id)
      if (item) item.pinned = item.pinned ? 0 : 1
    },

    async clearAll() {
      await window.api.clipboard.clearAll()
      this.items = this.items.filter(item => item.pinned)
      this.selectedIds.clear()
    },

    async paste(id) {
      await window.api.clipboard.paste(id)
      const item = this.items.find(item => item.id === id)
      if (item) {
        item.last_copied_at = new Date().toISOString()
        item.copy_count = (item.copy_count || 1) + 1
      }
    },

    addItem(item) {
      this.items.unshift(item)
      if (this.items.length > 200) {
        this.items = this.items.slice(0, 200)
      }
    },

    enterSelectMode() {
      this.selectMode = true
      this.selectedIds = new Set()
    },

    exitSelectMode() {
      this.selectMode = false
      this.selectedIds = new Set()
    },

    toggleSelect(id) {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id)
      } else {
        this.selectedIds.add(id)
      }
    },

    selectAll() {
      const filterIds = new Set(this.filteredItems.map(item => item.id))
      this.selectedIds = filterIds
    },

    async deleteSelected() {
      const ids = [...this.selectedIds]
      for (const id of ids) {
        await window.api.clipboard.delete(id)
      }
      this.items = this.items.filter(item => !this.selectedIds.has(item.id))
      this.exitSelectMode()
    }
  }
})
