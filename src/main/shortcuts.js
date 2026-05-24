import { globalShortcut } from 'electron'
import { getShortcuts } from './store.js'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

let registeredBindings = {}
let beforeInputWindowId = null

export function registerAllShortcuts(windowManager) {
  const shortcuts = getShortcuts()
  const window = windowManager.getWindow()

  console.log('[shortcuts] loaded:', JSON.stringify(shortcuts))

  globalShortcut.unregisterAll()
  registeredBindings = {}

  // Global shortcuts
  registerBinding(shortcuts['toggle-window'], () => {
    windowManager.toggle()
  })

  registerBinding(shortcuts['toggle-passthrough'], () => {
    windowManager.setPassThroughMode(!windowManager.passThroughMode)
  })

  // Window-level shortcuts (before-input-event)
  if (window && beforeInputWindowId !== window.id) {
    window.webContents.on('before-input-event', handleBeforeInput)
    beforeInputWindowId = window.id
  }

  // Store reference for reregisterShortcut
  registeredBindings._wm = windowManager
}

function handleBeforeInput(event, input) {
  if (input.type !== 'keyDown') return

  const shortcuts = getShortcuts()
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
  if (!accelerator) {
    console.error('[shortcuts] empty accelerator, skipping')
    return
  }
  try {
    const ok = globalShortcut.register(accelerator, callback)
    if (!ok) {
      console.error('[shortcuts] registration failed (possibly taken by another app):', accelerator)
    }
  } catch (e) {
    console.error('[shortcuts] registration error:', accelerator, e)
  }
}

export function reregisterShortcut(id, newBinding, windowManager) {
  // Unregister old accelerator for this id
  globalShortcut.unregisterAll()
  // Re-register all global shortcuts
  const wm = windowManager || registeredBindings._wm
  registerAllShortcuts(wm)
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll()
  registeredBindings = {}
  beforeInputWindowId = null
}
