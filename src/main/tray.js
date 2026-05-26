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
    this.counts = {}
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
    this.rebuildMenu(this.counts)
    return this.tray
  }

  updateIcon() {
    if (!this.tray) return
    const passThrough = this.windowManager.getInteractionState().passThrough
    this.tray.setImage(createTrayImage(passThrough))
    this.tray.setToolTip(passThrough ? '便签 - 鼠标穿透中' : '便签')
  }

  rebuildMenu(counts = this.counts) {
    this.counts = counts

    if (!this.tray) {
      return
    }

    const interactionState = this.windowManager.getInteractionState()

    this.updateIcon()

    const categoryItems = CATEGORIES.map((category) => ({
      label: `${category}${counts[category] ? ` (${counts[category]})` : ''}`,
      click: () => this.windowManager.show(category)
    }))

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `全部便签${this.totalCount() ? ` (${this.totalCount()})` : ''}`,
        click: () => this.windowManager.show(ALL_CATEGORY)
      },
      {
        label: '分类',
        submenu: categoryItems
      },
      { type: 'separator' },
      {
        label: '新建便签',
        click: () => this.windowManager.openNewNote()
      },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: interactionState.passThrough,
        click: (menuItem) => {
          this.windowManager.setPassThroughMode(menuItem.checked)
          this.rebuildMenu(this.counts)
        }
      },
      {
        label: '迷你卡片',
        type: 'checkbox',
        checked: interactionState.windowMode === 'mini',
        click: (menuItem) => {
          this.windowManager.setWindowMode(menuItem.checked ? 'mini' : 'normal')
          this.rebuildMenu(this.counts)
        }
      },
      {
        label: '贴边收纳',
        type: 'checkbox',
        checked: interactionState.edgeAutoHide,
        click: (menuItem) => {
          this.windowManager.setEdgeAutoHide(menuItem.checked)
          this.rebuildMenu(this.counts)
        }
      },
      {
        label: '快捷键设置',
        click: () => this.windowManager.openShortcutEditor()
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.isQuitting = true
          app.exit(0)
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }

  totalCount() {
    return Object.values(this.counts).reduce((sum, count) => sum + Number(count || 0), 0)
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
