import { app } from 'electron'
import { WindowManager } from './window-manager.js'
import { TrayController } from './tray.js'
import { registerIpc } from './ipc.js'
import { registerShortcuts, unregisterShortcuts } from './shortcuts.js'

let windowManager
let trayController

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    windowManager?.show()
  })

  app.whenReady().then(async () => {
    windowManager = new WindowManager()
    trayController = new TrayController(windowManager)

    registerIpc(windowManager, trayController)
    await windowManager.createFloatingWindow()
    trayController.create()
    registerShortcuts(windowManager)

    windowManager.show()
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    unregisterShortcuts()
    trayController?.destroy()
  })

  app.on('window-all-closed', (event) => {
    event.preventDefault()
  })
}
