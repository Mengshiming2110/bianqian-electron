import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { CATEGORIES } from './categories.js'

const APP_NAME = '领益工作助手'

function createTrayImage(passThrough) {
  const iconName = passThrough ? 'tray-pass-through.png' : 'tray-icon.png'
  const iconPath = join(app.getAppPath(), 'resources', iconName)
  const image = nativeImage.createFromPath(iconPath)
  if (!image.isEmpty()) {
    return image.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

export class TrayController {
  constructor(windowManager) {
    this.windowManager = windowManager
    this.tray = null
    this.counts = {}
  }

  create() {
    if (this.tray) {
      return this.tray
    }

    this.tray = new Tray(createTrayImage(this.windowManager.getInteractionState().passThrough))
    this.tray.setToolTip(APP_NAME)
    this.tray.on('click', () => this.windowManager.toggle())
    this.rebuildMenu(this.counts)
    return this.tray
  }

  updateIcon() {
    if (!this.tray) return
    this.tray.setImage(createTrayImage(this.windowManager.getInteractionState().passThrough))
    this.tray.setToolTip(APP_NAME)
  }

  rebuildMenu(counts = this.counts) {
    this.counts = counts || {}
    if (!this.tray) return

    this.updateIcon()

    const interactionState = this.windowManager.getInteractionState()
    const getWin = () => this.windowManager.getWindow()
    const openTab = (tab) => {
      const win = getWin()
      if (!win) return
      win.show()
      win.focus()
      win.webContents.send('navigate-tab', tab)
    }

    const template = [
      {
        label: APP_NAME,
        enabled: false
      },
      { type: 'separator' },
      {
        label: `备忘${counts?.total ? ` (${counts.total})` : ''}`,
        click: () => openTab('notes')
      },
      {
        label: '剪切板',
        click: () => openTab('clipboard')
      },
      {
        label: '邮件',
        click: () => openTab('mail')
      },
      { type: 'separator' },
      {
        label: '分类筛选',
        submenu: CATEGORIES.map((category) => ({
          label: category,
          click: () => {
            const win = getWin()
            if (!win) return
            win.show()
            win.focus()
            win.webContents.send('filter-category', category)
            win.webContents.send('navigate-tab', 'notes')
          }
        }))
      },
      {
        label: '新建备忘',
        click: () => {
          const win = getWin()
          if (!win) return
          win.show()
          win.focus()
          win.webContents.send('new-note')
          win.webContents.send('navigate-tab', 'notes')
        }
      },
      { type: 'separator' },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: interactionState.passThrough,
        click: () => {
          const win = getWin()
          if (win) win.webContents.send('toggle-pass-through')
        }
      },
      {
        label: '贴边自动收起',
        type: 'checkbox',
        checked: interactionState.edgeAutoHide,
        click: () => {
          this.windowManager.setEdgeAutoHide(!interactionState.edgeAutoHide)
          this.rebuildMenu(this.counts)
        }
      },
      { type: 'separator' },
      {
        label: '关于',
        click: () => {
          const win = getWin()
          if (!win) return
          win.show()
          win.focus()
          win.webContents.send('show-about')
        }
      },
      {
        label: '退出',
        // 用 app.quit() 而非 app.exit()：退出前必须触发 before-quit 持久化数据库、停止 MailService
        click: () => { app.quit() }
      }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
