import { app, screen } from 'electron'
import { WindowManager } from './window-manager.js'
import { TrayController } from './tray.js'
import { registerIpc } from './ipc.js'
import { registerAllShortcuts, unregisterAllShortcuts } from './shortcuts.js'
import { initDatabase, closeDatabase } from './database'
import { startClipboardMonitor, stopClipboardMonitor, setClipboardLimit } from './clipboard-monitor'
import { setupClipboardHandlers } from './ipc-clipboard'
import { setupMailHandlers, stopMailBridge } from './ipc-mail'
import { getSettings, updateSettings } from './store'

app.setAppUserModelId('com.local.bianqian')

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
    windowManager.setInteractionStateListener(() => {
      trayController?.rebuildMenu(trayController.counts)
    })

    // 初始化 SQLite
    initDatabase()

    // 加载设置，应用剪切板上限
    const settings = getSettings()
    setClipboardLimit(settings.clipboardLimit || 50)

    registerIpc(windowManager, trayController)
    setupClipboardHandlers()
    setupMailHandlers()

    await windowManager.createFloatingWindow()

    // 恢复窗口位置
    const savedBounds = settings.windowBounds
    if (savedBounds) {
      const displays = screen.getAllDisplays()
      const visible = displays.some(d => {
        const { x, y, width, height } = d.workArea
        return savedBounds.x >= x && savedBounds.y >= y &&
               savedBounds.x < x + width && savedBounds.y < y + height
      })
      if (visible) {
        const win = windowManager.getWindow()
        if (win && !win.isDestroyed()) {
          win.setBounds(savedBounds)
        }
      }
    }

    // 最小化时隐藏到托盘
    const win = windowManager.getWindow()
    if (win && !win.isDestroyed()) {
      win.on('minimize', (e) => {
        e.preventDefault()
        win.hide()
      })
    }

    trayController.create()
    registerAllShortcuts(windowManager)

    // 剪切板监听 — 新内容推送给渲染进程
    startClipboardMonitor((item) => {
      const w = windowManager.getWindow()
      if (w && !w.isDestroyed()) {
        w.webContents.send('clipboard:newItem', item)
      }
    })

    windowManager.show()
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    unregisterAllShortcuts()
    stopClipboardMonitor()
    stopMailBridge()
    closeDatabase()

    // 保存窗口位置
    const win = windowManager?.getWindow()
    if (win && !win.isDestroyed()) {
      const bounds = win.getBounds()
      updateSettings({ ...getSettings(), windowBounds: bounds })
    }
    trayController?.destroy()
  })

  app.on('window-all-closed', () => {
    // keep app running in tray
  })
}
