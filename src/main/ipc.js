import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
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
  updateNote,
  updateSettings
} from './store.js'
import {
  reregisterShortcut,
  registerAllShortcuts,
  startRecord,
  stopRecord,
  validateShortcutUpdate
} from './shortcuts.js'
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

function copyAttachments(srcPaths, limit = MAX_ATTACHMENTS_PER_NOTE) {
  const paths = Array.isArray(srcPaths) ? srcPaths : []
  const requestedLimit = Number(limit)
  const copyLimit = Math.max(
    0,
    Math.min(MAX_ATTACHMENTS_PER_NOTE, Number.isFinite(requestedLimit) ? requestedLimit : MAX_ATTACHMENTS_PER_NOTE)
  )
  const destDir = ATTACHMENTS_DIR()
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  return paths
    .filter((srcPath) => typeof srcPath === 'string' && srcPath && !isAttachmentPath(srcPath))
    .slice(0, copyLimit)
    .map((srcPath) => {
      const ext = basename(srcPath).includes('.') ? '.' + basename(srcPath).split('.').pop() : ''
      const destPath = join(destDir, `${randomUUID()}${ext}`)
      copyFileSync(srcPath, destPath)
      return destPath
    })
}

function normalizeAttachments(attachments) {
  return Array.isArray(attachments)
    ? [...new Set(attachments.map(String).filter(isAttachmentPath))].slice(0, MAX_ATTACHMENTS_PER_NOTE)
    : []
}

function normalizeNoteAttachments(note) {
  if (!note || typeof note !== 'object') return note
  return { ...note, attachments: normalizeAttachments(note.attachments) }
}

function normalizePatchAttachments(patch) {
  if (!patch || typeof patch !== 'object' || !Array.isArray(patch.attachments)) return patch
  return { ...patch, attachments: normalizeAttachments(patch.attachments) }
}

function cleanOrphanAttachments(currentNotes, candidates = null) {
  const dir = ATTACHMENTS_DIR()
  if (!existsSync(dir)) return

  const usedPaths = new Set()
  for (const note of currentNotes) {
    if (Array.isArray(note.attachments)) {
      for (const p of note.attachments) usedPaths.add(p)
    }
  }

  try {
    const paths = Array.isArray(candidates) && candidates.length
      ? [...new Set(candidates.map(String).filter(isAttachmentPath))]
      : readdirSync(dir).map((file) => join(dir, file))

    for (const fullPath of paths) {
      if (!usedPaths.has(fullPath)) {
        try { unlinkSync(fullPath) } catch {}
      }
    }
  } catch {}
}

export function registerIpc(windowManager, trayController) {
  ipcMain.handle('categories:list', () => ({ categories: CATEGORIES, allCategory: ALL_CATEGORY }))

  ipcMain.handle('notes:list', () => withLock(() => getNotes()))
  ipcMain.handle('notes:create', (_event, note) => withLock(() => createNote(normalizeNoteAttachments(note))))
  ipcMain.handle('notes:update', (_event, id, patch) => withLock(() => updateNote(id, normalizePatchAttachments(patch))))
  ipcMain.handle('notes:delete', (_event, id) => withLock(() => {
    const result = deleteNote(id)
    cleanOrphanAttachments(result)
    return result
  }))
  ipcMain.handle('notes:toggle', (_event, id) => withLock(() => toggleNote(id)))
  ipcMain.handle('notes:save-all', (_event, notes) => withLock(() => saveNotes(notes)))

  ipcMain.handle('dialog:select-attachments', async (event, limit) => {
    console.log('[attachments] select requested', { limit })
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent, {
      title: '选择附件',
      properties: ['openFile', 'multiSelections']
    })

    console.log('[attachments] select result', { canceled: result.canceled, count: result.filePaths.length })
    if (result.canceled || !result.filePaths.length) return []

    const copied = copyAttachments(result.filePaths, limit)
    console.log('[attachments] select copied', { count: copied.length })
    return copied
  })

  ipcMain.handle('files:import-attachments', (_event, paths, limit) => {
    console.log('[attachments] import requested', { count: Array.isArray(paths) ? paths.length : 0, limit })
    const copied = copyAttachments(paths, limit)
    console.log('[attachments] import copied', { count: copied.length })
    return copied
  })

  ipcMain.handle('files:cleanup-attachments', (_event, paths) => withLock(() => {
    cleanOrphanAttachments(getNotes(), paths)
    return true
  }))

  ipcMain.handle('files:max-attachments-per-note', () => {
    return MAX_ATTACHMENTS_PER_NOTE
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
  ipcMain.handle('window:set-theme', (_event, theme) => {
    updateSettings({ theme })
    const state = windowManager.getInteractionState()
    state.theme = theme
    return state
  })

  ipcMain.on('window:mouse-leave', () => windowManager.onMouseLeave())
  ipcMain.on('window:mouse-enter', () => windowManager.onMouseEnter())
  ipcMain.on('window:set-editing', (_event, editing) => windowManager.setEditing(editing))
  ipcMain.on('window:set-pinned', (_event, pinned) => windowManager.setPinned(pinned))
  ipcMain.on('window:resize-to-content', (_event, height) => windowManager.resizeToContent(height))

  ipcMain.on('tray:update-counts', (_event, counts) => {
    trayController.rebuildMenu(counts)
  })

  ipcMain.handle('shortcuts:list', () => getShortcuts())

  ipcMain.handle('shortcuts:update', (_event, id, binding) => {
    const validation = validateShortcutUpdate(id, binding)
    if (!validation.ok) {
      return { ok: false, error: validation.error, shortcuts: getShortcuts() }
    }

    const previousShortcuts = getShortcuts()
    const result = setShortcut(id, binding)
    const registration = reregisterShortcut(id, binding, windowManager)
    if (!registration?.ok) {
      const failure = registration?.failures?.[0]
      updateSettings({ shortcuts: previousShortcuts })
      registerAllShortcuts(windowManager)
      return {
        ok: false,
        error: failure?.reason === 'invalid-accelerator'
          ? '快捷键格式无效'
          : '快捷键注册失败，可能已被系统或其他应用占用',
        shortcuts: previousShortcuts
      }
    }
    return { ok: true, shortcuts: result }
  })

  ipcMain.handle('shortcuts:reset', () => {
    const result = resetShortcuts()
    const registration = registerAllShortcuts(windowManager)
    return {
      ok: registration?.ok !== false,
      shortcuts: result,
      error: registration?.ok === false ? '默认快捷键注册失败，可能已被系统或其他应用占用' : ''
    }
  })

  ipcMain.handle('shortcuts:start-record', () => {
    return startRecord(windowManager)
  })

  ipcMain.handle('shortcuts:stop-record', () => {
    return stopRecord(windowManager)
  })
}
