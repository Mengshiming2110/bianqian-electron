import { BrowserWindow, globalShortcut } from 'electron'
import { getShortcuts } from './store.js'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

let registeredBindings = {}
let beforeInputWindowId = null
let cachedShortcuts = null
let isRecording = false

function loadShortcuts() {
  cachedShortcuts = getShortcuts()
  return cachedShortcuts
}

export function registerAllShortcuts(windowManager) {
  const shortcuts = loadShortcuts()
  const window = windowManager.getWindow()

  globalShortcut.unregisterAll()
  registeredBindings = {}

  registerBinding(shortcuts['toggle-window'], () => {
    windowManager.toggle()
  })

  registerBinding(shortcuts['toggle-passthrough'], () => {
    windowManager.setPassThroughMode(!windowManager.passThroughMode)
  })

  if (window) {
    if (beforeInputWindowId !== null && beforeInputWindowId !== window.id) {
      const oldWindow = BrowserWindow?.fromId?.(beforeInputWindowId)
      if (oldWindow && !oldWindow.isDestroyed()) {
        oldWindow.webContents.removeListener('before-input-event', handleBeforeInput)
      }
    }
    if (beforeInputWindowId !== window.id) {
      window.webContents.on('before-input-event', handleBeforeInput)
      beforeInputWindowId = window.id
    }
  }

  registeredBindings._wm = windowManager
}

function handleBeforeInput(event, input) {
  if (input.type !== 'keyDown') return

  const shortcuts = cachedShortcuts || loadShortcuts()
  const pressed = inputToBinding(input)

  if (pressed === shortcuts['hide-window']) {
    registeredBindings._wm.hide()
    event.preventDefault()
    return
  }

  for (const cat of [ALL_CATEGORY, ...CATEGORIES]) {
    const binding = shortcuts[`category-${cat}`]
    if (binding && pressed === binding) {
      registeredBindings._wm.show(cat)
      event.preventDefault()
      return
    }
  }
}

function inputToBinding(input) {
  const parts = []
  if (input.control) parts.push('Ctrl')
  if (input.alt) parts.push('Alt')
  if (input.shift) parts.push('Shift')
  if (input.meta) parts.push('Meta')
  const key = input.key.length === 1 ? input.key.toUpperCase() : input.key
  parts.push(key)
  return parts.join('+')
}

function registerBinding(accelerator, callback) {
  if (!accelerator) return
  try {
    const ok = globalShortcut.register(accelerator, callback)
    if (!ok && !isRecording) {
      console.error('[shortcuts] registration failed:', accelerator)
    }
  } catch {}
}

export function reregisterShortcut(id, newBinding, windowManager) {
  loadShortcuts()
  globalShortcut.unregisterAll()
  const wm = windowManager || registeredBindings._wm
  registerAllShortcuts(wm)
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll()
  registeredBindings = {}
  cachedShortcuts = null
  beforeInputWindowId = null
}

export function startRecord(windowManager) {
  isRecording = true
  globalShortcut.unregisterAll()
  return true
}

export function stopRecord(windowManager) {
  try {
    registerAllShortcuts(windowManager)
  } finally {
    isRecording = false
  }
  return true
}
