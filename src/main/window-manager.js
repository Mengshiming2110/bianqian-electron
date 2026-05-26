import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CATEGORY } from './categories.js'
import { getSettings, updateSettings } from './store.js'
import { EdgeDockController, EDGE_STATE } from './edge-dock.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class WindowManager {
  constructor() {
    this.window = null
    this.clickThrough = false
    this.clickThroughForward = false
    this.hoverStartedAt = 0
    this.outsideStartedAt = 0
    this.pendingFilter = ALL_CATEGORY
    this.passThroughMode = false
    this.alwaysOnTop = true
    const settings = getSettings()
    this.opacity = settings.opacity
    this.windowMode = settings.windowMode
    this.shortcutEditor = null

    this.edge = new EdgeDockController(
      () => this.window,
      {
        onStateChange: () => this.broadcastInteractionState(),
        onInteractionChange: () => this.applyInteractionState()
      }
    )
    this.edge.autoHide = settings.edgeAutoHide
  }

  async createFloatingWindow() {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const workArea = screen.getPrimaryDisplay().workArea

    this.window = new BrowserWindow({
      width: this.windowMode === 'mini' ? 220 : 280,
      height: this.windowMode === 'mini' ? 180 : 360,
      minWidth: this.windowMode === 'mini' ? 210 : 260,
      minHeight: this.windowMode === 'mini' ? 150 : 360,
      x: workArea.x + workArea.width - 300,
      y: workArea.y + 20,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    this.applyAlwaysOnTop()
    this.applyOpacity()

    this.window.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        this.hide()
      }
    })

    this.window.on('closed', () => {
      this.edge.stopMouseWatcher()
      this.window = null
    })

    this.window.on('moved', () => this.edge.onWindowMoved())

    this.window.webContents.once('did-finish-load', () => {
      this.applyFilter(this.pendingFilter)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      await this.window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await this.window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.edge.startMouseWatcher()
    this.applyWindowMode()
    this.applyInteractionState()
    return this.window
  }

  getWindow() {
    return this.window
  }

  show(category = this.pendingFilter) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.pendingFilter = category || ALL_CATEGORY
    if (this.edge.isHidden()) {
      this.edge.show()
    } else if (this.edge.isDocked()) {
      // keep docked position
    } else {
      this.placeNearTopRight()
    }
    if (this.passThroughMode) {
      this.window.showInactive()
    } else {
      this.window.show()
      this.window.focus()
    }
    this.applyFilter(this.pendingFilter)
    this.applyAlwaysOnTop()
    this.applyInteractionState()
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.edge.restoreImmediate()
      this.window.hide()
      this._setClickThrough(true, false)
    }
  }

  toggle() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    if (this.window.isVisible()) {
      this.hide()
    } else {
      this.show(this.pendingFilter)
    }
  }

  openNewNote() {
    this.show(this.pendingFilter)
    this.send('editor:new')
  }

  applyFilter(category = ALL_CATEGORY) {
    this.pendingFilter = category
    this.send('notes:filter', category)
  }

  getInteractionState() {
    return {
      alwaysOnTop: this.alwaysOnTop,
      passThrough: this.passThroughMode,
      clickThrough: this.clickThrough,
      opacity: this.opacity,
      windowMode: this.windowMode,
      edgeAutoHide: this.edge.autoHide,
      edgeState: this.edge.state
    }
  }

  setPassThroughMode(enabled) {
    this.passThroughMode = Boolean(enabled)
    this.hoverStartedAt = 0
    this.outsideStartedAt = 0
    this.applyInteractionState()
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setOpacity(value) {
    this.opacity = updateSettings({ opacity: value }).opacity
    this.applyOpacity()
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setWindowMode(mode) {
    this.windowMode = mode === 'mini' ? 'mini' : 'normal'
    updateSettings({ windowMode: this.windowMode })
    this.applyWindowMode()
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setEdgeAutoHide(enabled) {
    this.edge.autoHide = Boolean(enabled)
    updateSettings({ edgeAutoHide: this.edge.autoHide })
    if (this.edge.autoHide) {
      this.edge.onWindowMoved()
    } else if (this.edge.isHidden()) {
      this.edge.show()
    } else {
      this.edge.clearHideTimer()
    }
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setEditing(editing) {
    this.edge.isEditing = Boolean(editing)
  }

  setPinned(pinned) {
    this.edge.isPinned = Boolean(pinned)
  }

  onMouseLeave() {
    this.edge.onMouseLeave()
  }

  onMouseEnter() {
    this.edge.onMouseEnter()
  }

  applyAlwaysOnTop() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.setAlwaysOnTop(this.alwaysOnTop, 'screen-saver')
  }

  applyInteractionState() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    if (typeof this.window.setFocusable === 'function') {
      this.window.setFocusable(!this.passThroughMode)
    }

    if (this.passThroughMode) {
      this._setClickThrough(true, false)
      return
    }

    if (this.edge.isHidden() || this.edge._animating) {
      this._setClickThrough(true, false)
      return
    }

    if (this.edge.isDocked()) {
      this._setClickThrough(false, false)
      return
    }

    this._setClickThrough(false, false)
  }

  applyOpacity() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.setOpacity(this.opacity)
  }

  applyWindowMode() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.edge.restoreImmediate({ keepDock: true })

    if (this.windowMode === 'mini') {
      this.window.setMinimumSize(210, 150)
      this.window.setBounds({ ...this.window.getBounds(), width: 220, height: 180 })
    } else {
      this.window.setMinimumSize(260, 200)
      const bounds = this.window.getBounds()
      this.window.setBounds({
        ...bounds,
        width: Math.max(bounds.width, 280)
      })
    }

    this.edge.onWindowMoved()
  }

  resizeToContent(contentHeight) {
    if (!this.window || this.window.isDestroyed()) return
    if (this.edge._animating) return

    const bounds = this.window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const minHeight = this.windowMode === 'mini' ? 150 : 200
    const maxHeight = workArea.height - 40
    const targetHeight = Math.max(minHeight, Math.min(maxHeight, Math.ceil(contentHeight)))

    if (Math.abs(bounds.height - targetHeight) < 4) return

    this.window.setBounds({ ...bounds, height: targetHeight })
    this.edge.onWindowMoved()
  }

  broadcastInteractionState() {
    this.send('window:interaction-state', this.getInteractionState())
  }

  send(channel, payload) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.webContents.send(channel, payload)
  }

  openShortcutEditor() {
    if (this.shortcutEditor && !this.shortcutEditor.isDestroyed()) {
      this.shortcutEditor.show()
      this.shortcutEditor.focus()
      return
    }

    this.shortcutEditor = new BrowserWindow({
      width: 340,
      height: 420,
      resizable: false,
      frame: false,
      parent: this.window,
      show: false,
      focusable: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    this.shortcutEditor.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const parts = []
      if (input.control) parts.push('Ctrl')
      if (input.alt) parts.push('Alt')
      if (input.shift) parts.push('Shift')
      if (input.meta) parts.push('Meta')
      const key = input.key.length === 1 ? input.key.toUpperCase() : input.key
      parts.push(key)
      this.shortcutEditor.webContents.send('shortcut-editor:keydown', {
        binding: parts.join('+'),
        key: input.key
      })
    })

    this.shortcutEditor.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        this.shortcutEditor.hide()
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      this.shortcutEditor.loadURL(process.env.ELECTRON_RENDERER_URL + '#shortcut-editor')
    } else {
      this.shortcutEditor.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'shortcut-editor' })
    }

    this.shortcutEditor.once('ready-to-show', () => {
      this.shortcutEditor.show()
      this.shortcutEditor.focus()
    })
  }

  placeNearTopRight() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    const bounds = this.window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const x = Math.min(bounds.x, workArea.x + workArea.width - bounds.width - 12)
    const y = Math.max(bounds.y, workArea.y + 12)
    this.window.setBounds({ ...bounds, x, y })
  }

  updateClickThrough() {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return
    }

    if (this.edge.isHidden() || this.edge._animating) {
      this._setClickThrough(true, false)
      return
    }

    if (this.passThroughMode) {
      this._setClickThrough(true, false)
      return
    }

    if (this.edge.isDocked()) {
      this._setClickThrough(false, false)
      return
    }

    const point = screen.getCursorScreenPoint()
    const bounds = this.window.getBounds()
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height

    const now = Date.now()

    if (inside) {
      this.outsideStartedAt = 0
      if (!this.hoverStartedAt) {
        this.hoverStartedAt = now
      }
      if (this.clickThrough && now - this.hoverStartedAt >= 200) {
        this._setClickThrough(false, false)
      }
      return
    }

    this.hoverStartedAt = 0
    if (!this.outsideStartedAt) {
      this.outsideStartedAt = now
    }
    if (!this.clickThrough && now - this.outsideStartedAt >= 1500) {
      this._setClickThrough(true, true)
    }
  }

  _setClickThrough(enabled, forward = false) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    if (this.clickThrough === enabled && this.clickThroughForward === forward) {
      return
    }

    this.clickThrough = enabled
    this.clickThroughForward = forward

    if (enabled && forward) {
      this.window.setIgnoreMouseEvents(true, { forward: true })
    } else {
      this.window.setIgnoreMouseEvents(enabled)
    }

    this.broadcastInteractionState()
  }
}
