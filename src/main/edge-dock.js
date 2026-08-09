import { screen } from 'electron'

const EDGE_THRESHOLD = 28        // 吸附判定距离
const EDGE_EXPOSED = 6           // 隐藏时露出像素
const EDGE_HIDE_DELAY = 500      // 鼠标离开后延迟隐藏
const MOUSE_POLL_MS = 100        // 鼠标轮询间隔

export const EDGE_STATE = {
  NORMAL: 'normal',
  DOCKED_LEFT: 'docked_left',
  DOCKED_RIGHT: 'docked_right',
  HIDDEN_LEFT: 'hidden_left',
  HIDDEN_RIGHT: 'hidden_right'
}

export class EdgeDockController {
  constructor(windowGetter, opts = {}) {
    this._getWindow = windowGetter
    this.onStateChange = opts.onStateChange || (() => {})
    this.onInteractionChange = opts.onInteractionChange || (() => {})

    this.state = EDGE_STATE.NORMAL
    this.autoHide = false
    this.isPinned = false
    this.isEditing = false

    this._visibleX = null           // dock/hidden 时的可见 X
    this._mouseTimer = null
    this._hideTimer = null
    this._snapTimer = null
    this._mouseInside = false
  }

  get window() { return this._getWindow() }

  isDocked() { return this.state === EDGE_STATE.DOCKED_LEFT || this.state === EDGE_STATE.DOCKED_RIGHT }
  isHidden() { return this.state === EDGE_STATE.HIDDEN_LEFT || this.state === EDGE_STATE.HIDDEN_RIGHT }

  // ===== 位置计算 =====

  getWorkArea() {
    const win = this.window
    if (!win || win.isDestroyed()) return screen.getPrimaryDisplay().workArea
    return screen.getDisplayMatching(win.getBounds()).workArea
  }

  _xForState(state, bounds, area) {
    switch (state) {
      case EDGE_STATE.DOCKED_LEFT:  return area.x
      case EDGE_STATE.DOCKED_RIGHT: return area.x + area.width - bounds.width
      case EDGE_STATE.HIDDEN_LEFT:  return area.x - bounds.width + EDGE_EXPOSED
      case EDGE_STATE.HIDDEN_RIGHT: return area.x + area.width - EDGE_EXPOSED
      default: return bounds.x
    }
  }

  // ===== moved 事件：驱动 NORMAL↔DOCKED =====

  onWindowMoved() {
    clearTimeout(this._snapTimer)
    this._snapTimer = setTimeout(() => this.checkSnap(), 100)
  }

  checkSnap() {
    const win = this.window
    if (!win || win.isDestroyed()) return
    if (this.isPinned) return

    // 只在 NORMAL 或 DOCKED 时响应移动
    if (this.isHidden()) return

    const bounds = win.getBounds()
    const area = this.getWorkArea()
    const distLeft = Math.abs(bounds.x - area.x)
    const distRight = Math.abs(bounds.x + bounds.width - (area.x + area.width))

    if (distLeft <= EDGE_THRESHOLD && distLeft <= distRight) {
      this._setState(EDGE_STATE.DOCKED_LEFT, bounds, area)
    } else if (distRight <= EDGE_THRESHOLD) {
      this._setState(EDGE_STATE.DOCKED_RIGHT, bounds, area)
    } else if (this.isDocked()) {
      // 从 DOCKED 拖离边缘
      this._setState(EDGE_STATE.NORMAL, bounds, area)
    }
  }

  // ===== 鼠标轮询：驱动 HIDDEN↔DOCKED 和 DOCKED→HIDDEN =====

  startMouseWatcher() {
    this.stopMouseWatcher()
    this._mouseTimer = setInterval(() => this._pollMouse(), MOUSE_POLL_MS)
  }

  stopMouseWatcher() {
    if (this._mouseTimer) { clearInterval(this._mouseTimer); this._mouseTimer = null }
    this._clearHideTimer()
  }

  _pollMouse() {
    const win = this.window
    if (!win || win.isDestroyed() || !win.isVisible()) return

    const cursor = screen.getCursorScreenPoint()
    const area = this.getWorkArea()
    const bounds = win.getBounds()

    // 隐藏状态：鼠标靠近边缘就显示
    if (this.isHidden()) {
      const reveal = EDGE_EXPOSED + 12
      const triggered =
        (this.state === EDGE_STATE.HIDDEN_LEFT  && cursor.x <= area.x + reveal) ||
        (this.state === EDGE_STATE.HIDDEN_RIGHT && cursor.x >= area.x + area.width - reveal)
      if (triggered) {
        const newState = this.state === EDGE_STATE.HIDDEN_LEFT ? EDGE_STATE.DOCKED_LEFT : EDGE_STATE.DOCKED_RIGHT
        this._setState(newState, bounds, area)
        return
      }
      return
    }

    // 停靠状态 + 自动隐藏：鼠标进出由 onMouseEnter/onMouseLeave 事件处理（单一数据源）
    if (!this.autoHide || !this.isDocked()) return
  }

  _scheduleHide() {
    if (this._hideTimer) return
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null
      this.hide()
    }, EDGE_HIDE_DELAY)
  }

  _clearHideTimer() {
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null }
  }

  onMouseEnter() {
    this._mouseInside = true
    this._clearHideTimer()
  }

  onMouseLeave() {
    if (!this.autoHide || !this.isDocked() || this.isPinned || this.isEditing) return
    this._mouseInside = false
    this._scheduleHide()
  }

  // Public alias for window-manager
  clearHideTimer() {
    this._clearHideTimer()
  }

  // ===== show/hide (入口：托盘点击 / 快捷键) =====

  hide() {
    const win = this.window
    if (!this.autoHide || !this.isDocked()) return
    if (!win || win.isDestroyed()) return

    const bounds = win.getBounds()
    const area = this.getWorkArea()
    const newState = this.state === EDGE_STATE.DOCKED_LEFT ? EDGE_STATE.HIDDEN_LEFT : EDGE_STATE.HIDDEN_RIGHT
    this._setState(newState, bounds, area)
  }

  show() {
    const win = this.window
    if (!this.isHidden()) return
    if (!win || win.isDestroyed()) return

    this._clearHideTimer()
    const bounds = win.getBounds()
    const area = this.getWorkArea()
    const newState = this.state === EDGE_STATE.HIDDEN_LEFT ? EDGE_STATE.DOCKED_LEFT : EDGE_STATE.DOCKED_RIGHT
    this._setState(newState, bounds, area)
  }

  // ===== 核心：状态切换 + 窗口定位 =====

  _setState(newState, bounds, area) {
    if (this.state === newState) return

    const targetX = this._xForState(newState, bounds, area)
    const win = this.window

    this.state = newState
    this._visibleX = this.isDocked() ? targetX : (this.isHidden() ? targetX : null)

    // 仅当 X 真的需要变时才 setBounds（避免触发多余的 moved 事件）
    if (win && !win.isDestroyed() && bounds.x !== targetX) {
      win.setBounds({ ...bounds, x: targetX })
    }

    this.onInteractionChange()
    this.onStateChange()
  }

  // ===== 恢复（窗口切换/关闭时用） =====

  restoreImmediate({ keepDock = false } = {}) {
    this._clearHideTimer()

    const win = this.window
    if (!win || win.isDestroyed()) return

    if (this.isHidden()) {
      const bounds = win.getBounds()
      const area = this.getWorkArea()
      // 恢复时使用 DOCKED 位置，而非隐藏时记录的离屏 _visibleX
      const dockedState = this.state === EDGE_STATE.HIDDEN_LEFT ? EDGE_STATE.DOCKED_LEFT : EDGE_STATE.DOCKED_RIGHT
      const targetX = this._xForState(dockedState, bounds, area)
      win.setBounds({ ...bounds, x: targetX })
    }

    if (!keepDock) {
      this.state = EDGE_STATE.NORMAL
      this._visibleX = null
    } else if (this.isHidden()) {
      this.state = this.state === EDGE_STATE.HIDDEN_LEFT ? EDGE_STATE.DOCKED_LEFT : EDGE_STATE.DOCKED_RIGHT
    }
    this.onInteractionChange()
  }

  // ===== 清理 =====

  getDockedX() {
    if (!this.isDocked()) return null
    return this._visibleX
  }

  destroy() {
    this.stopMouseWatcher()
    clearTimeout(this._snapTimer)
  }
}
