import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CATEGORY } from './categories.js'
import { getSettings, updateSettings } from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class WindowManager {
  constructor() {
    this.window = null
    this.clickThrough = false
    this.clickThroughForward = false
    this.hoverStartedAt = 0
    this.outsideStartedAt = 0
    this.pointerTimer = null
    this.pendingFilter = ALL_CATEGORY
    this.passThroughMode = false
    this.alwaysOnTop = true
    this.opacity = getSettings().opacity
    this.shortcutEditor = null
  }

  async createFloatingWindow() {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const workArea = screen.getPrimaryDisplay().workArea

    this.window = new BrowserWindow({
      width: 280,
      height: 500,
      minWidth: 260,
      minHeight: 360,
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
        sandbox: false
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
      this.stopPointerWatcher()
      this.window = null
    })

    this.window.webContents.once('did-finish-load', () => {
      this.applyFilter(this.pendingFilter)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      await this.window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await this.window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.startPointerWatcher()
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
    this.placeNearTopRight()
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
      opacity: this.opacity
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

    this._setClickThrough(true, true)
  }

  applyOpacity() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.setOpacity(this.opacity)
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
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
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

  startPointerWatcher() {
    this.stopPointerWatcher()
    this.pointerTimer = setInterval(() => this.updateClickThroughByPointer(), 100)
  }

  stopPointerWatcher() {
    if (this.pointerTimer) {
      clearInterval(this.pointerTimer)
      this.pointerTimer = null
    }
  }

  updateClickThroughByPointer() {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return
    }

    if (this.passThroughMode) {
      this._setClickThrough(true, false)
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
