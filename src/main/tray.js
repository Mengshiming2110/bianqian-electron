import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { ALL_CATEGORY, CATEGORIES } from './categories.js'

const baseSvg = (dotColor) => encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect x="4" y="6" width="18" height="20" rx="3" fill="#f2ca52"/>
  <path d="M8 11h10M8 15h10M8 19h7" stroke="#31413f" stroke-width="1.8" stroke-linecap="round"/>
  ${dotColor ? `<circle cx="25" cy="8" r="6.5" fill="#fff"/><circle cx="25" cy="8" r="5" fill="${dotColor}"/>` : ''}
</svg>`)

function createTrayImage(passThrough) {
  const iconName = passThrough ? 'tray-pass-through.png' : 'tray.png'
  const iconPath = join(app.getAppPath(), 'resources', iconName)
  const fileImage = nativeImage.createFromPath(iconPath)
  if (!fileImage.isEmpty()) {
    return fileImage.resize({ width: 16, height: 16 })
  }

  const dotColor = passThrough ? '#4a90d9' : ''
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${baseSvg(dotColor)}`)
  return image.resize({ width: 16, height: 16 })
}

export class TrayController {
  constructor(windowManager) {
    this.windowManager = windowManager
    this.tray = null
  }

  create() {
    if (this.tray) {
      return this.tray
    }

    const passThrough = this.windowManager.getInteractionState().passThrough
    const image = createTrayImage(passThrough)
    this.tray = new Tray(image)
    this.tray.setToolTip('便签')
    this.tray.on('click', () => this.windowManager.toggle())
    this.rebuildMenu()
    return this.tray
  }

  updateIcon() {
    if (!this.tray) return
    const passThrough = this.windowManager.getInteractionState().passThrough
    this.tray.setImage(createTrayImage(passThrough))
    this.tray.setToolTip('便签')
  }

  rebuildMenu() {
    if (!this.tray) return

    this.updateIcon()

    const interactionState = this.windowManager.getInteractionState()

    const getWin = () => this.windowManager.getWindow()

    const template = [
      {
        label: '📋 便签',
        click: () => {
          const win = getWin()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('navigate-tab', 'notes')
          }
        }
      },
      {
        label: '📎 剪切板',
        click: () => {
          const win = getWin()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('navigate-tab', 'clipboard')
          }
        }
      },
      {
        label: '📧 邮件',
        click: () => {
          const win = getWin()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('navigate-tab', 'mail')
          }
        }
      },
      { type: 'separator' },
      {
        label: '📂 分类',
        submenu: CATEGORIES.filter(c => c !== '全部').map(cat => ({
          label: `  ${cat}`,
          click: () => {
            const win = getWin()
            if (win) {
              win.show()
              win.focus()
              win.webContents.send('filter-category', cat)
              win.webContents.send('navigate-tab', 'notes')
            }
          }
        }))
      },
      { type: 'separator' },
      {
        label: '➕ 新建便签',
        click: () => {
          const win = getWin()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('new-note')
            win.webContents.send('navigate-tab', 'notes')
          }
        }
      },
      { type: 'separator' },
      {
        label: '👁 穿透开关',
        type: 'checkbox',
        checked: interactionState.passThrough,
        click: () => {
          const win = getWin()
          if (win) win.webContents.send('toggle-pass-through')
        }
      },
      {
        label: '⏸ 暂停剪切板监听',
        type: 'checkbox',
        checked: false,
        click: () => {
          const win = getWin()
          if (win) win.webContents.send('toggle-clipboard-monitor')
        }
      },
      { type: 'separator' },
      {
        label: 'ℹ 关于',
        click: () => {
          const win = getWin()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('show-about')
          }
        }
      },
      {
        label: '✕ 退出',
        click: () => { app.exit(0) }
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
