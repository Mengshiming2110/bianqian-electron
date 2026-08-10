import { contextBridge, ipcRenderer, webUtils } from 'electron'

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

function pathsFromFiles(files) {
  return Array.from(files || [])
    .map((file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return file?.path || ''
      }
    })
    .filter(Boolean)
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || [])
    .some((type) => String(type).toLowerCase() === 'files')
}

window.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}, true)

window.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return
  event.preventDefault()

  const paths = pathsFromFiles(event.dataTransfer?.files)
  console.info('[preload] file drop', { count: paths.length, paths })
  if (!paths.length) return

  window.postMessage({
    source: 'bianqian-preload',
    type: 'file-drop',
    paths,
    clientX: event.clientX,
    clientY: event.clientY
  }, '*')
}, true)

contextBridge.exposeInMainWorld('api', {
  categories: {
    list: () => ipcRenderer.invoke('categories:list')
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    create: (note) => ipcRenderer.invoke('notes:create', note),
    update: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    toggle: (id) => ipcRenderer.invoke('notes:toggle', id)
  },
  files: {
    selectAttachments: (limit) => ipcRenderer.invoke('dialog:select-attachments', limit),
    importAttachments: (paths, limit) => ipcRenderer.invoke('files:import-attachments', paths, limit),
    cleanupAttachments: (paths) => ipcRenderer.invoke('files:cleanup-attachments', paths),
    pathsFromFiles,
    openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
  },
  tray: {
    updateCounts: (counts) => ipcRenderer.send('tray:update-counts', counts)
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    show: (category) => ipcRenderer.invoke('window:show', category),
    getInteractionState: () => ipcRenderer.invoke('window:get-interaction-state'),
    setPassThrough: (enabled) => ipcRenderer.invoke('window:set-pass-through', enabled),
    setOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
    setEdgeAutoHide: (enabled) => ipcRenderer.invoke('window:set-edge-auto-hide', enabled),
    setTheme: (theme) => ipcRenderer.invoke('window:set-theme', theme),
    mouseLeave: () => ipcRenderer.send('window:mouse-leave'),
    mouseEnter: () => ipcRenderer.send('window:mouse-enter'),
    setEditing: (editing) => ipcRenderer.send('window:set-editing', editing),
    onFilterCategory: (callback) => on('notes:filter', callback),
    onCreateNote: (callback) => on('editor:new', callback),
    onInteractionState: (callback) => on('window:interaction-state', callback)
  },
  noteWindow: {
    open: (noteId, noteData) => ipcRenderer.invoke('note-window:open', noteId, noteData),
    onData: (callback) => on('note-window:data', callback)
  },
  contextMenu: {
    show: (noteData) => ipcRenderer.invoke('context-menu:show', noteData),
    onAction: (callback) => on('context-menu:action', callback)
  },
  shortcuts: {
    list: () => ipcRenderer.invoke('shortcuts:list'),
    update: (id, binding) => ipcRenderer.invoke('shortcuts:update', id, binding),
    reset: () => ipcRenderer.invoke('shortcuts:reset'),
    startRecord: () => ipcRenderer.invoke('shortcuts:start-record'),
    stopRecord: () => ipcRenderer.invoke('shortcuts:stop-record')
  },
  notify: {
    trigger: (opts) => ipcRenderer.invoke('notify:trigger', opts),
    onClick: (callback) => on('notify:clicked', callback)
  },
  clipboard: {
    list: (limit, offset) => ipcRenderer.invoke('clipboard:list', limit, offset),
    delete: (id) => ipcRenderer.invoke('clipboard:delete', id),
    togglePin: (id) => ipcRenderer.invoke('clipboard:togglePin', id),
    clearAll: () => ipcRenderer.invoke('clipboard:clearAll'),
    paste: (id) => ipcRenderer.invoke('clipboard:paste', id),
    onNewItem: (callback) => on('clipboard:newItem', callback)
  },
  mail: {
    configure: (config) => ipcRenderer.invoke('mail:configure', config),
    list: () => ipcRenderer.invoke('mail:list'),
    fetch: () => ipcRenderer.invoke('mail:fetch'),
    doctor: (config) => ipcRenderer.invoke('mail:doctor', config),
    fix: (action) => ipcRenderer.invoke('mail:fix', action),
    config: () => ipcRenderer.invoke('mail:config'),
    detail: (id) => ipcRenderer.invoke('mail:detail', id),
    stop: () => ipcRenderer.invoke('mail:stop'),
    status: () => ipcRenderer.invoke('mail:status'),
    attachments: (mailId) => ipcRenderer.invoke('mail:attachments', mailId),
    attachmentContent: (mailId, filename) => ipcRenderer.invoke('mail:attachment-content', mailId, filename)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s) => ipcRenderer.invoke('settings:save', s)
  },
  events: {
    on: on
  }
})
