import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CATEGORY } from './categories.js'
import { getSettings, updateSettings } from './store.js'
import { EdgeDockController, EDGE_STATE } from './edge-dock.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NORMAL_WINDOW_WIDTH = 280
const NORMAL_WINDOW_HEIGHT = 680
const NORMAL_WINDOW_MIN_WIDTH = 260
const APP_ICON_PATH = join(app.getAppPath(), 'resources', 'icon.ico')

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
    this.interactionStateListener = null
    this.noteWindows = new Map()
    this.settingsWin = null

    this.edge = new EdgeDockController(
      () => this.window,
      {
        onStateChange: () => this.broadcastInteractionState(),
        onInteractionChange: () => this.applyInteractionState()
      }
    )
    this.edge.autoHide = settings.edgeAutoHide
  }

  getDefaultBounds() {
    const workArea = screen.getPrimaryDisplay().workArea
    return {
      width: NORMAL_WINDOW_WIDTH,
      height: NORMAL_WINDOW_HEIGHT,
      x: workArea.x + workArea.width - 300,
      y: workArea.y + 20
    }
  }

  getInitialBounds() {
    const savedBounds = getSettings().windowBounds
    if (savedBounds) {
      const displays = screen.getAllDisplays()
      const visible = displays.some(d => {
        const { x, y, width, height } = d.workArea
        return savedBounds.x >= x && savedBounds.y >= y &&
               savedBounds.x < x + width && savedBounds.y < y + height
      })
      if (visible) return savedBounds
    }
    return this.getDefaultBounds()
  }

  async createFloatingWindow() {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    // Windows 上透明窗口的 skipTaskbar 不可靠，用一个隐藏 owner 窗口让主窗口成为 owned window，
    // owned window 不会出现在任务栏
    if (process.platform === 'win32' && (!this.ownerWin || this.ownerWin.isDestroyed())) {
      this.ownerWin = new BrowserWindow({
        show: false,
        skipTaskbar: true,
        width: 0,
        height: 0,
        frame: false,
        transparent: true,
        webPreferences: { sandbox: true }
      })
    }

    this.window = new BrowserWindow({
      ...this.getInitialBounds(),
      minWidth: NORMAL_WINDOW_MIN_WIDTH,
      minHeight: NORMAL_WINDOW_HEIGHT,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      icon: APP_ICON_PATH,
      backgroundColor: '#00000000',
      parent: process.platform === 'win32' ? this.ownerWin : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    this.window.setSkipTaskbar(true)
    this.applyAlwaysOnTop()
    this.applyOpacity()

    // Windows 上 show()/focus() 会反复把窗口塞回任务栏，每次都重新清理
    const reapplySkipTaskbar = () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setSkipTaskbar(true)
      }
    }
    this.window.on('show', reapplySkipTaskbar)
    this.window.on('focus', reapplySkipTaskbar)
    this.window.on('restore', reapplySkipTaskbar)
    this.window.on('show', () => setTimeout(reapplySkipTaskbar, 80))

    this.window.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        this.hide()
      }
    })

    this.window.on('closed', () => {
      this.edge.stopMouseWatcher()
      this.window = null
      if (this.ownerWin && !this.ownerWin.isDestroyed()) {
        this.ownerWin.destroy()
        this.ownerWin = null
      }
    })

    this.window.on('minimize', (e) => {
      e.preventDefault()
      this.window.hide()
    })

    this.window.on('moved', () => {
      this.edge.onWindowMoved()
      updateSettings({ windowBounds: this.window.getBounds() })
    })

    this.window.on('resized', () => {
      updateSettings({ windowBounds: this.window.getBounds() })
    })

    this.window.webContents.once('did-finish-load', () => {
      this.applyFilter(this.pendingFilter)
    })

    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const d = typeof level === 'object' && level !== null ? level : { level, message, lineNumber: line, sourceId }
      console.log(`[renderer:${d.level}] ${d.message} (${d.sourceId}:${d.lineNumber})`)
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
      this.window.setSkipTaskbar(true)
      this.window.showInactive()
    } else {
      this._setClickThrough(false, false)
      this.window.setSkipTaskbar(true)
      this.window.show()
      this.window.focus()
    }
    this.window.setSkipTaskbar(true)
    // Windows 上 show()/focus() 可能重新加入任务栏，延迟再清理一次
    setTimeout(() => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setSkipTaskbar(true)
      }
    }, 60)
    this.applyFilter(this.pendingFilter)
    this.applyAlwaysOnTop()
    this.applyInteractionState()
    this.edge.onWindowMoved()
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
    const settings = getSettings()
    return {
      alwaysOnTop: this.alwaysOnTop,
      passThrough: this.passThroughMode,
      clickThrough: this.clickThrough,
      opacity: this.opacity,
      windowMode: this.windowMode,
      edgeAutoHide: this.edge.autoHide,
      edgeState: this.edge.state,
      theme: settings.theme
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
    this.windowMode = 'normal'
    updateSettings({ windowMode: this.windowMode })
    this.applyWindowMode()
    this.broadcastInteractionState()
    return this.getInteractionState()
  }

  setEdgeAutoHide(enabled) {
    this.edge.autoHide = Boolean(enabled)
    updateSettings({ edgeAutoHide: this.edge.autoHide })
    if (this.edge.autoHide) {
      this.edge.checkSnap()
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

    this.window.setMinimumSize(NORMAL_WINDOW_MIN_WIDTH, NORMAL_WINDOW_HEIGHT)
    const bounds = this.window.getBounds()
    this.window.setBounds({
      ...bounds,
      width: Math.max(bounds.width, NORMAL_WINDOW_WIDTH),
      height: Math.max(bounds.height, NORMAL_WINDOW_HEIGHT)
    })

    this.ensureVisibleInWorkArea()
    this.edge.onWindowMoved()
  }

  resizeToContent(contentHeight) {
    if (!this.window || this.window.isDestroyed()) return
    if (this.edge._animating) return

    const bounds = this.window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const minHeight = NORMAL_WINDOW_HEIGHT
    const maxHeight = Math.min(workArea.height - 80, workArea.y + workArea.height - bounds.y - 40)
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
    const edgeState = this.edge.state
    const edgeManaged = this.edge.isDocked() || this.edge.isHidden()

    // 边缘管理窗口：X 由 EdgeDockController 控制，这里只调整 Y/height
    if (edgeManaged) {
      const workArea = screen.getDisplayMatching(bounds).workArea
      const height = Math.min(Math.max(bounds.height, NORMAL_WINDOW_HEIGHT), workArea.height - 24)
      const y = Math.max(workArea.y + 12, Math.min(bounds.y, workArea.y + workArea.height - height - 12))
      if (bounds.y !== y || bounds.height !== height) {
        this.window.setBounds({ x: bounds.x, y, width: bounds.width, height })
      }
      return
    }

    // 非边缘管理窗口：完整约束
    const isOffscreenCoord = bounds.x < -10000 || bounds.y < -10000
    const workArea = isOffscreenCoord
      ? screen.getPrimaryDisplay().workArea
      : screen.getDisplayMatching(bounds).workArea
    const width = Math.min(Math.max(bounds.width, NORMAL_WINDOW_MIN_WIDTH), workArea.width - 24)
    const height = Math.min(Math.max(bounds.height, NORMAL_WINDOW_HEIGHT), workArea.height - 24)
    const y = isOffscreenCoord
      ? workArea.y + 20
      : Math.max(workArea.y + 12, Math.min(bounds.y, workArea.y + workArea.height - height - 12))
    const x = isOffscreenCoord
      ? workArea.x + workArea.width - width - 20
      : Math.max(workArea.x + 12, Math.min(bounds.x, workArea.x + workArea.width - width - 12))

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

  openNoteWindow(noteId, noteData) {
    if (this.noteWindows.has(noteId)) {
      const existing = this.noteWindows.get(noteId)
      if (!existing.isDestroyed()) {
        existing.focus()
        return
      }
      this.noteWindows.delete(noteId)
    }

    const workArea = screen.getPrimaryDisplay().workArea
    const startX = noteData._screenX != null ? noteData._screenX : workArea.x + 100 + (this.noteWindows.size * 30) % 200
    const startY = noteData._screenY != null ? noteData._screenY : workArea.y + 100 + (this.noteWindows.size * 30) % 150

    const win = new BrowserWindow({
      width: 280,
      height: 320,
      minWidth: 200,
      minHeight: 150,
      x: startX,
      y: startY,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      frame: false,
      transparent: true,
      title: noteData.title || '领益工作助手',
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const devServerUrl = process.env.ELECTRON_RENDERER_URL
    if (devServerUrl) {
      win.loadURL(`${devServerUrl}/#/note/${noteId}`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/note/${noteId}` })
    }

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('note-window:data', noteData)
    })

    win.on('closed', () => {
      this.noteWindows.delete(noteId)
    })

    this.noteWindows.set(noteId, win)
    return win
  }

  closeNoteWindow(noteId) {
    const win = this.noteWindows.get(noteId)
    if (win && !win.isDestroyed()) {
      win.close()
    }
    this.noteWindows.delete(noteId)
  }

  closeAllNoteWindows() {
    for (const [id, win] of this.noteWindows) {
      if (!win.isDestroyed()) win.close()
    }
    this.noteWindows.clear()
  }

  sendToNoteWindow(noteId, channel, data) {
    const win = this.noteWindows.get(noteId)
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  openSettingsWindow(screenX, screenY) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      this.settingsWin.setSkipTaskbar(true)
      this.settingsWin.show()
      this.settingsWin.focus()
      setTimeout(() => {
        if (this.settingsWin && !this.settingsWin.isDestroyed()) {
          this.settingsWin.setSkipTaskbar(true)
        }
      }, 60)
      return
    }

    const workArea = screen.getPrimaryDisplay().workArea
    const width = 252
    const height = 380
    const x = Math.max(workArea.x + 8, Math.min(Math.round(screenX), workArea.x + workArea.width - width - 8))
    const y = Math.max(workArea.y + 8, Math.min(Math.round(screenY), workArea.y + workArea.height - height - 8))

    this.settingsWin = new BrowserWindow({
      width,
      height,
      minWidth: 220,
      minHeight: 200,
      resizable: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      parent: this.window,
      x,
      y,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    this.settingsWin.on('closed', () => {
      this.settingsWin = null
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('settings-window:closed')
      }
    })

    this.settingsWin.on('blur', () => {
      setTimeout(() => {
        if (this.settingsWin && !this.settingsWin.isDestroyed() && !this.settingsWin.isFocused()) {
          this.closeSettingsWindow()
        }
      }, 150)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      this.settingsWin.loadURL(process.env.ELECTRON_RENDERER_URL + '/#/settings')
    } else {
      this.settingsWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/settings' })
    }

    this.settingsWin.once('ready-to-show', () => {
      if (this.settingsWin && !this.settingsWin.isDestroyed()) {
        this.settingsWin.setSkipTaskbar(true)
        this.settingsWin.show()
        this.settingsWin.focus()
        setTimeout(() => {
          if (this.settingsWin && !this.settingsWin.isDestroyed()) {
            this.settingsWin.setSkipTaskbar(true)
          }
        }, 60)
      }
    })
  }

  closeSettingsWindow() {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      this.settingsWin.close()
    }
  }
}
