import { app } from 'electron'
import { WindowManager } from './window-manager.js'
import { TrayController } from './tray.js'
import { applyAutoStart, registerIpc } from './ipc.js'
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

    registerIpc(windowManager, trayController)
    setupClipboardHandlers()
    setupMailHandlers()
    applyAutoStart(settings.autoStart)

    await windowManager.createFloatingWindow()

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
