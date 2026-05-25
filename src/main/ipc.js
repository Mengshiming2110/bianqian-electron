import { app, dialog, globalShortcut, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
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
import { reregisterShortcut, registerAllShortcuts } from './shortcuts.js'

export function registerIpc(windowManager, trayController) {
  ipcMain.handle('notes:list', () => getNotes())
  ipcMain.handle('notes:create', (_event, note) => createNote(note))
  ipcMain.handle('notes:update', (_event, id, patch) => updateNote(id, patch))
  ipcMain.handle('notes:delete', (_event, id) => deleteNote(id))
  ipcMain.handle('notes:toggle', (_event, id) => toggleNote(id))
  ipcMain.handle('notes:save-all', (_event, notes) => saveNotes(notes))

  ipcMain.handle('dialog:select-attachments', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择附件',
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || !result.filePaths.length) return []

  const destDir = join(app.getPath('userData'), 'attachments')
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  return result.filePaths.map((srcPath) => {
    const destPath = join(destDir, `${Date.now()}_${basename(srcPath)}`)
    copyFileSync(srcPath, destPath)
    return destPath
  })
  })

  ipcMain.handle('shell:open-path', (_event, path) => {
    if (!path) {
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
    globalShortcut.unregisterAll()
    return true
  })

  ipcMain.handle('shortcuts:stop-record', () => {
    registerAllShortcuts(windowManager)
    return true
  })
}
