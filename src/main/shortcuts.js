import { BrowserWindow, globalShortcut } from 'electron'
import { getShortcuts } from './store.js'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

let registeredBindings = {}
let beforeInputWindowId = null
let cachedShortcuts = null
let isRecording = false

const GLOBAL_SHORTCUT_IDS = new Set(['toggle-window', 'toggle-passthrough'])

function loadShortcuts() {
  cachedShortcuts = getShortcuts()
  return cachedShortcuts
}

export function registerAllShortcuts(windowManager) {
  const shortcuts = loadShortcuts()
  const window = windowManager.getWindow()
  const failures = []

  globalShortcut.unregisterAll()
  registeredBindings = {}

  registerBinding('toggle-window', shortcuts['toggle-window'], () => {
    windowManager.toggle()
  }, failures)

  registerBinding('toggle-passthrough', shortcuts['toggle-passthrough'], () => {
    windowManager.setPassThroughMode(!windowManager.passThroughMode)
  }, failures)

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
  return { ok: failures.length === 0, failures }
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

function registerBinding(id, accelerator, callback, failures = []) {
  if (!accelerator) return true
  try {
    const ok = globalShortcut.register(accelerator, callback)
    if (!ok && !isRecording) {
      console.error('[shortcuts] registration failed:', accelerator)
    }
    if (!ok) {
      failures.push({ id, binding: accelerator, reason: 'registration-failed' })
    }
    return ok
  } catch {}
  failures.push({ id, binding: accelerator, reason: 'invalid-accelerator' })
  return false
}

export function reregisterShortcut(id, newBinding, windowManager) {
  loadShortcuts()
  globalShortcut.unregisterAll()
  const wm = windowManager || registeredBindings._wm
  return registerAllShortcuts(wm)
}

export function validateShortcutUpdate(id, binding) {
  if (!binding || typeof binding !== 'string') {
    return { ok: false, error: '快捷键不能为空' }
  }

  if (!GLOBAL_SHORTCUT_IDS.has(id)) {
    return { ok: true }
  }

  try {
    const ok = globalShortcut.register(binding, () => {})
    if (ok) {
      globalShortcut.unregister(binding)
      return { ok: true }
    }

    return { ok: false, error: '快捷键注册失败，可能已被系统或其他应用占用' }
  } catch {
    return { ok: false, error: '快捷键格式无效' }
  }
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
    return registerAllShortcuts(windowManager)
  } finally {
    isRecording = false
  }
}
