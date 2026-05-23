import { globalShortcut } from 'electron'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

export function registerShortcuts(windowManager) {
  globalShortcut.register('F3', () => {
    windowManager.toggle()
  })

  const window = windowManager.getWindow()

  if (!window) {
    return
  }

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return
    }

    if (input.key === 'Escape') {
      windowManager.hide()
      event.preventDefault()
      return
    }

    if (input.alt && /^[1-9]$/.test(input.key)) {
      const categories = [ALL_CATEGORY, ...CATEGORIES]
      const category = categories[Number(input.key) - 1]

      if (category) {
        windowManager.show(category)
        event.preventDefault()
      }
    }
  })
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll()
}
