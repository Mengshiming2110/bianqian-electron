import { contextBridge, ipcRenderer } from 'electron'

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  categories: {
    list: () => ipcRenderer.invoke('categories:list')
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    create: (note) => ipcRenderer.invoke('notes:create', note),
    update: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    toggle: (id) => ipcRenderer.invoke('notes:toggle', id),
    saveAll: (notes) => ipcRenderer.invoke('notes:save-all', notes)
  },
  files: {
    selectAttachments: () => ipcRenderer.invoke('dialog:select-attachments'),
    openPath: (path) => ipcRenderer.invoke('shell:open-path', path)
  },
  tray: {
    updateCounts: (counts) => ipcRenderer.send('tray:update-counts', counts)
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    show: (category) => ipcRenderer.invoke('window:show', category),
    newNote: () => ipcRenderer.invoke('window:new-note'),
    getInteractionState: () => ipcRenderer.invoke('window:get-interaction-state'),
    setPassThrough: (enabled) => ipcRenderer.invoke('window:set-pass-through', enabled),
    setOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
    setMode: (mode) => ipcRenderer.invoke('window:set-mode', mode),
    setEdgeAutoHide: (enabled) => ipcRenderer.invoke('window:set-edge-auto-hide', enabled),
    mouseLeave: () => ipcRenderer.send('window:mouse-leave'),
    mouseEnter: () => ipcRenderer.send('window:mouse-enter'),
    setEditing: (editing) => ipcRenderer.send('window:set-editing', editing),
    setPinned: (pinned) => ipcRenderer.send('window:set-pinned', pinned),
    onFilterCategory: (callback) => on('notes:filter', callback),
    onCreateNote: (callback) => on('editor:new', callback),
    onInteractionState: (callback) => on('window:interaction-state', callback)
  },
  shortcuts: {
    list: () => ipcRenderer.invoke('shortcuts:list'),
    update: (id, binding) => ipcRenderer.invoke('shortcuts:update', id, binding),
    reset: () => ipcRenderer.invoke('shortcuts:reset'),
    startRecord: () => ipcRenderer.invoke('shortcuts:start-record'),
    stopRecord: () => ipcRenderer.invoke('shortcuts:stop-record'),
    onKeydown: (callback) => on('shortcut-editor:keydown', callback)
  }
})
