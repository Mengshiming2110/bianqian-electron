import { contextBridge, ipcRenderer } from 'electron'

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
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
    onFilterCategory: (callback) => on('notes:filter', callback),
    onCreateNote: (callback) => on('editor:new', callback),
    onInteractionState: (callback) => on('window:interaction-state', callback)
  }
})
