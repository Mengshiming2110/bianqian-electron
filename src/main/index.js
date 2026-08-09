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

app.setName('领益工作助手')
app.setAppUserModelId('com.lingyi.workassistant')

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
    await initDatabase()

    // 加载设置，应用剪切板上限
    const settings = getSettings()
    setClipboardLimit(settings.clipboardLimit ?? 50)
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.autoStart),
        path: process.execPath
      })
    } catch (err) {
      console.warn('[settings] autoStart restore failed:', err?.message || err)
    }

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
          windowManager.edge.onWindowMoved()
        }
      }
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
    try { unregisterAllShortcuts() } catch (err) { console.error('[quit] unregisterAllShortcuts:', err?.message || err) }
    try { stopClipboardMonitor() } catch (err) { console.error('[quit] stopClipboardMonitor:', err?.message || err) }
    try { stopMailBridge() } catch (err) { console.error('[quit] stopMailBridge:', err?.message || err) }
    try { closeDatabase() } catch (err) { console.error('[quit] closeDatabase:', err?.message || err) }

    // 保存窗口位置
    try {
      const win = windowManager?.getWindow()
      if (win && !win.isDestroyed()) {
        const bounds = win.getBounds()
        updateSettings({ ...getSettings(), windowBounds: bounds })
      }
    } catch (err) { console.error('[quit] save window bounds:', err?.message || err) }
    try { trayController?.destroy() } catch (err) { console.error('[quit] tray destroy:', err?.message || err) }
  })

  app.on('window-all-closed', () => {
    // keep app running in tray
  })
}
