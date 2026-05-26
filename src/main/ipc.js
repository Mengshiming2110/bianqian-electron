import { app, dialog, globalShortcut, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createNote,
  deleteNote,
  getNotes,
  getShortcuts,
  saveNotes,
  setShortcut,
  resetShortcuts,
  toggleNote,
  updateNote
} from './store.js'
import { reregisterShortcut, registerAllShortcuts, startRecord, stopRecord } from './shortcuts.js'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

const ATTACHMENTS_DIR = () => join(app.getPath('userData'), 'attachments')
const MAX_ATTACHMENTS_PER_NOTE = 10

let storeLock = Promise.resolve()

function withLock(fn) {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  storeLock = storeLock.then(
    () => { try { resolve(fn()) } catch (err) { reject(err) } },
    (err) => reject(err)
  )
  return promise
}

function isAttachmentPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const normalized = filePath.replace(/\\/g, '/')
  const allowed = ATTACHMENTS_DIR().replace(/\\/g, '/')
  return normalized.startsWith(allowed + '/')
}

function cleanOrphanAttachments(currentNotes) {
  const dir = ATTACHMENTS_DIR()
  if (!existsSync(dir)) return

  const usedPaths = new Set()
  for (const note of currentNotes) {
    if (Array.isArray(note.attachments)) {
      for (const p of note.attachments) usedPaths.add(p)
    }
  }

  try {
    const files = readdirSync(dir)
    for (const file of files) {
      const fullPath = join(dir, file)
      if (!usedPaths.has(fullPath)) {
        try { unlinkSync(fullPath) } catch {}
      }
    }
  } catch {}
}

export function registerIpc(windowManager, trayController) {
  ipcMain.handle('categories:list', () => ({ categories: CATEGORIES, allCategory: ALL_CATEGORY }))

  ipcMain.handle('notes:list', () => withLock(() => getNotes()))
  ipcMain.handle('notes:create', (_event, note) => withLock(() => createNote(note)))
  ipcMain.handle('notes:update', (_event, id, patch) => withLock(() => updateNote(id, patch)))
  ipcMain.handle('notes:delete', (_event, id) => withLock(() => {
    const result = deleteNote(id)
    cleanOrphanAttachments(result)
    return result
  }))
  ipcMain.handle('notes:toggle', (_event, id) => withLock(() => toggleNote(id)))
  ipcMain.handle('notes:save-all', (_event, notes) => withLock(() => saveNotes(notes)))

  ipcMain.handle('dialog:select-attachments', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择附件',
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || !result.filePaths.length) return []

    const destDir = ATTACHMENTS_DIR()
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    return result.filePaths.slice(0, MAX_ATTACHMENTS_PER_NOTE).map((srcPath) => {
      const ext = basename(srcPath).includes('.') ? '.' + basename(srcPath).split('.').pop() : ''
      const destPath = join(destDir, `${randomUUID()}${ext}`)
      copyFileSync(srcPath, destPath)
      return destPath
    })
  })

  ipcMain.handle('shell:open-path', (_event, path) => {
    if (!path || !isAttachmentPath(path)) {
      return false
    }

    shell.openPath(path)
    return true
  })

  ipcMain.handle('window:hide', () => windowManager.hide())
  ipcMain.handle('window:show', (_event, category) => windowManager.show(category))
  ipcMain.handle('window:new-note', () => windowManager.openNewNote())
  ipcMain.handle('window:get-interaction-state', () => windowManager.getInteractionState())
  ipcMain.handle('window:set-pass-through', (_event, enabled) => {
    const state = windowManager.setPassThroughMode(enabled)
    trayController.rebuildMenu(trayController.counts)
    return state
  })
  ipcMain.handle('window:set-opacity', (_event, opacity) => {
    const state = windowManager.setOpacity(opacity)
    return state
  })
  ipcMain.handle('window:set-mode', (_event, mode) => {
    const state = windowManager.setWindowMode(mode)
    trayController.rebuildMenu(trayController.counts)
    return state
  })
  ipcMain.handle('window:set-edge-auto-hide', (_event, enabled) => {
    const state = windowManager.setEdgeAutoHide(enabled)
    trayController.rebuildMenu(trayController.counts)
    return state
  })

  ipcMain.on('window:mouse-leave', () => windowManager.onMouseLeave())
  ipcMain.on('window:mouse-enter', () => windowManager.onMouseEnter())
  ipcMain.on('window:set-editing', (_event, editing) => windowManager.setEditing(editing))
  ipcMain.on('window:set-pinned', (_event, pinned) => windowManager.setPinned(pinned))

  ipcMain.on('tray:update-counts', (_event, counts) => {
    trayController.rebuildMenu(counts)
  })

  ipcMain.handle('shortcuts:list', () => getShortcuts())

  ipcMain.handle('shortcuts:update', (_event, id, binding) => {
    const result = setShortcut(id, binding)
    reregisterShortcut(id, binding, windowManager)
    return { ok: true, shortcuts: result }
  })

  ipcMain.handle('shortcuts:reset', () => {
    const result = resetShortcuts()
    registerAllShortcuts(windowManager)
    return { ok: true, shortcuts: result }
  })

  ipcMain.handle('shortcuts:start-record', () => {
    return startRecord(windowManager)
  })

  ipcMain.handle('shortcuts:stop-record', () => {
    return stopRecord(windowManager)
  })
}
