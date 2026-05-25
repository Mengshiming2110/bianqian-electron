import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CATEGORY } from './categories.js'
import { getSettings, updateSettings } from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EDGE_THRESHOLD = 20
const EDGE_EXPOSED = 4
const EDGE_HIDE_DELAY = 500
const EDGE_ANIMATION_MS = 180

const EDGE_STATE = {
  NORMAL: 'normal',
  DOCKED_LEFT: 'docked_left',
  DOCKED_RIGHT: 'docked_right',
  HIDDEN_LEFT: 'hidden_left',
  HIDDEN_RIGHT: 'hidden_right'
}

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
    const settings = getSettings()
    this.opacity = settings.opacity
    this.windowMode = settings.windowMode
    this.edgeAutoHide = settings.edgeAutoHide
    this.shortcutEditor = null

    // Edge dock state machine
    this.edgeState = EDGE_STATE.NORMAL
    this.edgeSnapTimer = null
    this.edgeHideTimer = null
    this.edgeAnimFrame = null
    this.edgeAnimating = false
    this.edgeVisibleX = null
    this.isEditing = false
    this.isPinned = false
  }

  async createFloatingWindow() {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const workArea = screen.getPrimaryDisplay().workArea

    this.window = new BrowserWindow({
      width: this.windowMode === 'mini' ? 220 : 280,
      height: this.windowMode === 'mini' ? 180 : 500,
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
      this.stopEdgeMouseWatcher()
      this.window = null
    })

    this.window.on('moved', () => this.onWindowMoved())

    this.window.webContents.once('did-finish-load', () => {
      this.applyFilter(this.pendingFilter)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      await this.window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await this.window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.startEdgeMouseWatcher()
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
    if (this.isEdgeHidden()) {
      this.showEdge()
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
      this.restoreEdgeImmediate()
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
      edgeAutoHide: this.edgeAutoHide,
      edgeState: this.edgeState
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
    this.edgeAutoHide = Boolean(enabled)
    updateSettings({ edgeAutoHide: this.edgeAutoHide })
    if (this.edgeAutoHide) {
      this.onWindowMoved()
    } else if (this.isEdgeHidden()) {
      this.showEdge()
    } else {
      this.clearEdgeHideTimer()
    }
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setEditing(editing) {
    this.isEditing = Boolean(editing)
  }

  setPinned(pinned) {
    this.isPinned = Boolean(pinned)
  }

  // ── Renderer mouse events (primary hide trigger) ──

  onMouseLeave() {
    if (!this.edgeAutoHide || !this.isEdgeDocked() || this.isPinned || this.isEditing || this.isEdgeHidden()) {
      return
    }
    this.scheduleEdgeHide()
  }

  onMouseEnter() {
    this.clearEdgeHideTimer()
  }

  // ── Window interaction state ──

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

  applyWindowMode() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.restoreEdgeImmediate({ keepDock: true })

    if (this.windowMode === 'mini') {
      this.window.setMinimumSize(210, 150)
      this.window.setBounds({ ...this.window.getBounds(), width: 220, height: 180 })
    } else {
      this.window.setMinimumSize(260, 360)
      const bounds = this.window.getBounds()
      this.window.setBounds({
        ...bounds,
        width: Math.max(bounds.width, 280),
        height: Math.max(bounds.height, 500)
      })
    }

    this.onWindowMoved()
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

  // ── Shortcut editor ──

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

  // ═══════════════════════════════════════════════
  //  Edge Dock — GPT-architected state machine
  // ═══════════════════════════════════════════════

  isEdgeDocked() {
    return this.edgeState === EDGE_STATE.DOCKED_LEFT ||
           this.edgeState === EDGE_STATE.DOCKED_RIGHT
  }

  isEdgeHidden() {
    return this.edgeState === EDGE_STATE.HIDDEN_LEFT ||
           this.edgeState === EDGE_STATE.HIDDEN_RIGHT
  }

  getWorkArea() {
    return screen.getDisplayMatching(this.window.getBounds()).workArea
  }

  // ── Snap detection (triggered by window 'moved') ──

  onWindowMoved() {
    if (this.edgeAnimating || this.isEdgeHidden()) return

    clearTimeout(this.edgeSnapTimer)
    this.edgeSnapTimer = setTimeout(() => this.checkSnap(), 80)
  }

  checkSnap() {
    if (!this.window || this.window.isDestroyed() || this.edgeAnimating) return
    if (this.isPinned) return

    const bounds = this.window.getBounds()
    const area = this.getWorkArea()

    const distLeft = Math.abs(bounds.x - area.x)
    const distRight = Math.abs(bounds.x + bounds.width - (area.x + area.width))

    if (distLeft <= EDGE_THRESHOLD && distLeft <= distRight) {
      this.dockLeft()
    } else if (distRight <= EDGE_THRESHOLD) {
      this.dockRight()
    } else {
      this.edgeState = EDGE_STATE.NORMAL
      this.edgeVisibleX = null
      this.broadcastInteractionState()
    }
  }

  dockLeft() {
    const bounds = this.window.getBounds()
    const area = this.getWorkArea()
    this.window.setBounds({ ...bounds, x: area.x })
    this.edgeState = EDGE_STATE.DOCKED_LEFT
    this.edgeVisibleX = area.x
    this.broadcastInteractionState()
  }

  dockRight() {
    const bounds = this.window.getBounds()
    const area = this.getWorkArea()
    this.window.setBounds({ ...bounds, x: area.x + area.width - bounds.width })
    this.edgeState = EDGE_STATE.DOCKED_RIGHT
    this.edgeVisibleX = area.x + area.width - bounds.width
    this.broadcastInteractionState()
  }

  // ── Hide / Show (triggered by renderer mouseleave / edge mouse watcher) ──

  scheduleEdgeHide() {
    if (!this.edgeAutoHide || this.isEdgeHidden() || this.edgeAnimating) return

    this.clearEdgeHideTimer()
    this.edgeHideTimer = setTimeout(() => this.hideEdge(), EDGE_HIDE_DELAY)
  }

  clearEdgeHideTimer() {
    if (this.edgeHideTimer) {
      clearTimeout(this.edgeHideTimer)
      this.edgeHideTimer = null
    }
  }

  hideEdge() {
    if (!this.edgeAutoHide || !this.isEdgeDocked() || this.edgeAnimating) return
    if (!this.window || this.window.isDestroyed()) return

    const bounds = this.window.getBounds()
    const area = this.getWorkArea()

    if (this.edgeState === EDGE_STATE.DOCKED_LEFT) {
      this.edgeState = EDGE_STATE.HIDDEN_LEFT
      this.animateTo(-bounds.width + EDGE_EXPOSED)
    } else if (this.edgeState === EDGE_STATE.DOCKED_RIGHT) {
      this.edgeState = EDGE_STATE.HIDDEN_RIGHT
      this.animateTo(area.x + area.width - EDGE_EXPOSED)
    }

    this._setClickThrough(true, true)
    this.broadcastInteractionState()
  }

  showEdge() {
    if (!this.isEdgeHidden() || this.edgeAnimating) return
    if (!this.window || this.window.isDestroyed()) return

    this.clearEdgeHideTimer()
    const area = this.getWorkArea()

    if (this.edgeState === EDGE_STATE.HIDDEN_LEFT) {
      this.edgeState = EDGE_STATE.DOCKED_LEFT
      this.animateTo(area.x)
    } else if (this.edgeState === EDGE_STATE.HIDDEN_RIGHT) {
      const bounds = this.window.getBounds()
      this.edgeState = EDGE_STATE.DOCKED_RIGHT
      this.animateTo(area.x + area.width - bounds.width)
    }

    this.applyAlwaysOnTop()
    this.applyInteractionState()
    this.broadcastInteractionState()
  }

  // ── Animation (cubic ease-out, setImmediate loop) ──

  animateTo(targetX) {
    if (this.edgeAnimating) return
    this.edgeAnimating = true

    const bounds = this.window.getBounds()
    const startX = bounds.x
    const startTime = Date.now()

    const tick = () => {
      if (!this.window || this.window.isDestroyed()) {
        this.edgeAnimating = false
        return
      }

      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / EDGE_ANIMATION_MS, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const x = Math.round(startX + (targetX - startX) * eased)

      this.window.setBounds({ ...bounds, x })

      if (t < 1) {
        setImmediate(tick)
      } else {
        this.window.setBounds({ ...bounds, x: targetX })
        this.edgeAnimating = false
        this.edgeVisibleX = this.isEdgeDocked() ? targetX : this.edgeVisibleX
      }
    }

    tick()
  }

  // ── Restore (called on hide/close) ──

  restoreEdgeImmediate({ keepDock = false } = {}) {
    this.clearEdgeHideTimer()

    if (this.isEdgeHidden() && this.edgeVisibleX != null && this.window && !this.window.isDestroyed()) {
      const bounds = this.window.getBounds()
      this.window.setBounds({ ...bounds, x: this.edgeVisibleX })
    }

    if (!keepDock) {
      this.edgeState = EDGE_STATE.NORMAL
      this.edgeVisibleX = null
    } else if (this.isEdgeHidden()) {
      this.edgeState = this.edgeState === EDGE_STATE.HIDDEN_LEFT
        ? EDGE_STATE.DOCKED_LEFT
        : EDGE_STATE.DOCKED_RIGHT
    }
    this.applyInteractionState()
  }

  // ── Mouse watcher (polling: reveal trigger only) ──

  startEdgeMouseWatcher() {
    this.stopEdgeMouseWatcher()
    this.pointerTimer = setInterval(() => this.checkEdgeMouse(), 50)
  }

  stopEdgeMouseWatcher() {
    if (this.pointerTimer) {
      clearInterval(this.pointerTimer)
      this.pointerTimer = null
    }
    this.clearEdgeHideTimer()
  }

  _edgeDebug(counter) {
    if (counter % 20 !== 0) return // log every 1s
    console.log('[edge]',
      'state:', this.edgeState,
      'autoHide:', this.edgeAutoHide,
      'docked:', this.isEdgeDocked(),
      'hidden:', this.isEdgeHidden(),
      'animating:', this.edgeAnimating,
      'pinned:', this.isPinned,
      'editing:', this.isEditing,
      'hideTimer:', !!this.edgeHideTimer,
      'visible:', this.window?.isVisible()
    )
  }

  checkEdgeMouse() {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return

    this._edgeCounter = (this._edgeCounter || 0) + 1
    this._edgeDebug(this._edgeCounter)

    const cursor = screen.getCursorScreenPoint()
    const area = this.getWorkArea()

    // Reveal trigger when hidden
    if (this.isEdgeHidden() && !this.edgeAnimating) {
      if (this.edgeState === EDGE_STATE.HIDDEN_LEFT && cursor.x <= area.x + 2) {
        this.showEdge()
        return
      }
      if (this.edgeState === EDGE_STATE.HIDDEN_RIGHT && cursor.x >= area.x + area.width - 2) {
        this.showEdge()
        return
      }
    }

    // Fallback: hide scheduling via polling (when docked + visible + autoHide on)
    if (this.edgeAutoHide && this.isEdgeDocked() && !this.edgeAnimating && !this.isPinned && !this.isEditing) {
      const bounds = this.window.getBounds()
      const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width &&
          cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height
      if (this._edgeCounter % 20 === 0) {
        console.log('[edge] cursor:', cursor.x, cursor.y, 'bounds:', bounds.x, bounds.y, bounds.width, bounds.height, 'inside:', inside)
      }
      if (inside) {
        this.clearEdgeHideTimer()
      } else if (!this.edgeHideTimer) {
        console.log('[edge] scheduling hide — cursor outside, no timer pending')
        this.scheduleEdgeHide()
      }
    }

    // Update click-through
    this.updateClickThrough()
  }

  // ── Click-through management ──

  updateClickThrough() {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return
    }

    if (this.isEdgeHidden() || this.edgeAnimating) {
      this._setClickThrough(true, true)
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
