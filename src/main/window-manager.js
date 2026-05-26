import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CATEGORY } from './categories.js'
import { getSettings, updateSettings } from './store.js'
import { EdgeDockController, EDGE_STATE } from './edge-dock.js'
import { stopRecord } from './shortcuts.js'

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
    this.interactionStateListener = null

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
      height: this.windowMode === 'mini' ? 120 : 360,
      minWidth: this.windowMode === 'mini' ? 200 : 260,
      minHeight: this.windowMode === 'mini' ? 80 : 360,
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

    this.window.setSkipTaskbar(true)
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

    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
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

  setInteractionStateListener(listener) {
    this.interactionStateListener = typeof listener === 'function' ? listener : null
  }

  show(category = this.pendingFilter) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.pendingFilter = category || ALL_CATEGORY
    this.ensureVisibleInWorkArea()
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
      this._setClickThrough(false, false)
      this.window.show()
      this.window.focus()
    }
    this.window.setSkipTaskbar(true)
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
      this.window.setMinimumSize(200, 80)
      this.window.setBounds({ ...this.window.getBounds(), width: 220 })
    } else {
      this.window.setMinimumSize(260, 200)
      const bounds = this.window.getBounds()
      this.window.setBounds({
        ...bounds,
        width: Math.max(bounds.width, 280)
      })
    }

    this.ensureVisibleInWorkArea()
    this.edge.onWindowMoved()
  }

  resizeToContent(contentHeight) {
    if (!this.window || this.window.isDestroyed()) return
    if (this.edge._animating) return

    const bounds = this.window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const minHeight = this.windowMode === 'mini' ? 80 : 360
    const maxHeight = this.windowMode === 'mini'
      ? workArea.height - 40
      : Math.min(workArea.height - 80, workArea.y + workArea.height - bounds.y - 40)
    const targetHeight = Math.max(minHeight, Math.min(maxHeight, Math.ceil(contentHeight)))
    const targetY = Math.max(
      workArea.y + 12,
      Math.min(bounds.y, workArea.y + workArea.height - targetHeight - 40)
    )

    if (Math.abs(bounds.height - targetHeight) < 4 && Math.abs(bounds.y - targetY) < 2) return

    this.window.setBounds({ ...bounds, y: targetY, height: targetHeight })
    this.ensureVisibleInWorkArea()
    this.edge.onWindowMoved()
  }

  broadcastInteractionState() {
    const state = this.getInteractionState()
    this.send('window:interaction-state', state)
    this.interactionStateListener?.(state)
  }

  send(channel, payload) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    const contents = this.window.webContents
    if (!contents || contents.isDestroyed() || contents.isLoadingMainFrame()) {
      return
    }

    try {
      contents.send(channel, payload)
    } catch (error) {
      console.warn(`[window] skipped send:${channel}`, error?.message || error)
    }
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
        sandbox: false
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
      stopRecord(this)
      if (!app.isQuitting) {
        event.preventDefault()
        this.shortcutEditor.hide()
      }
    })

    this.shortcutEditor.on('closed', () => {
      stopRecord(this)
      this.shortcutEditor = null
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

    this.ensureVisibleInWorkArea()
  }

  ensureVisibleInWorkArea() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    const bounds = this.window.getBounds()
    const isOffscreenCoord = bounds.x < -10000 || bounds.y < -10000
    const workArea = isOffscreenCoord
      ? screen.getPrimaryDisplay().workArea
      : screen.getDisplayMatching(bounds).workArea
    const width = Math.min(
      Math.max(bounds.width, this.windowMode === 'mini' ? 200 : 260),
      workArea.width - 24
    )
    const height = Math.min(
      Math.max(bounds.height, this.windowMode === 'mini' ? 80 : 200),
      workArea.height - 24
    )
    const offscreen =
      isOffscreenCoord ||
      bounds.x + width < workArea.x + 24 ||
      bounds.x > workArea.x + workArea.width - 24 ||
      bounds.y + height < workArea.y + 24 ||
      bounds.y > workArea.y + workArea.height - 24
    const x = offscreen
      ? workArea.x + workArea.width - width - 20
      : Math.max(workArea.x + 12, Math.min(bounds.x, workArea.x + workArea.width - width - 12))
    const y = offscreen
      ? workArea.y + 20
      : Math.max(workArea.y + 12, Math.min(bounds.y, workArea.y + workArea.height - height - 12))

    this.window.setBounds({ x, y, width, height })
  }

  updateClickThrough() {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return
    }

    if (this.passThroughMode) {
      this._setClickThrough(true, false)
      return
    }

    this._setClickThrough(false, false)
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
