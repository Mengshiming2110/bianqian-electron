import { screen } from 'electron'

const EDGE_THRESHOLD = 20
const EDGE_EXPOSED = 4
const EDGE_HIDE_DELAY = 500
const EDGE_ANIMATION_MS = 180
const ANIMATION_FRAME_MS = 16

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

    this._snapTimer = null
    this._hideTimer = null
    this._animFrame = null
    this._animating = false
    this._visibleX = null
    this._pointerTimer = null
  }

  get window() { return this._getWindow() }

  isDocked() {
    return this.state === EDGE_STATE.DOCKED_LEFT ||
           this.state === EDGE_STATE.DOCKED_RIGHT
  }

  isHidden() {
    return this.state === EDGE_STATE.HIDDEN_LEFT ||
           this.state === EDGE_STATE.HIDDEN_RIGHT
  }

  getWorkArea() {
    const win = this.window
    if (!win || win.isDestroyed()) return screen.getPrimaryDisplay().workArea
    return screen.getDisplayMatching(win.getBounds()).workArea
  }

  onWindowMoved() {
    if (this._animating || this.isHidden()) return
    clearTimeout(this._snapTimer)
    this._snapTimer = setTimeout(() => this.checkSnap(), 80)
  }

  checkSnap() {
    const win = this.window
    if (!win || win.isDestroyed() || this._animating) return
    if (this.isPinned || !this.autoHide) return

    const bounds = win.getBounds()
    const area = this.getWorkArea()
    const distLeft = Math.abs(bounds.x - area.x)
    const distRight = Math.abs(bounds.x + bounds.width - (area.x + area.width))

    if (distLeft <= EDGE_THRESHOLD && distLeft <= distRight) {
      this._dockLeft()
    } else if (distRight <= EDGE_THRESHOLD) {
      this._dockRight()
    } else {
      this.state = EDGE_STATE.NORMAL
      this._visibleX = null
      this.onStateChange()
    }
  }

  _dockLeft() {
    const win = this.window
    if (!win || win.isDestroyed()) return
    const bounds = win.getBounds()
    const area = this.getWorkArea()
    win.setBounds({ ...bounds, x: area.x })
    this.state = EDGE_STATE.DOCKED_LEFT
    this._visibleX = area.x
    this.onStateChange()
  }

  _dockRight() {
    const win = this.window
    if (!win || win.isDestroyed()) return
    const bounds = win.getBounds()
    const area = this.getWorkArea()
    win.setBounds({ ...bounds, x: area.x + area.width - bounds.width })
    this.state = EDGE_STATE.DOCKED_RIGHT
    this._visibleX = area.x + area.width - bounds.width
    this.onStateChange()
  }

  onMouseLeave() {
    if (!this.autoHide || !this.isDocked() || this.isPinned || this.isEditing || this.isHidden()) return
    this.scheduleHide()
  }

  onMouseEnter() {
    this.clearHideTimer()
  }

  scheduleHide() {
    if (!this.autoHide || this.isHidden() || this._animating) return
    this.clearHideTimer()
    this._hideTimer = setTimeout(() => this.hide(), EDGE_HIDE_DELAY)
  }

  clearHideTimer() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer)
      this._hideTimer = null
    }
  }

  hide() {
    const win = this.window
    if (!this.autoHide || !this.isDocked() || this._animating) return
    if (!win || win.isDestroyed()) return

    const bounds = win.getBounds()
    const area = this.getWorkArea()

    if (this.state === EDGE_STATE.DOCKED_LEFT) {
      this.state = EDGE_STATE.HIDDEN_LEFT
      this._animateTo(area.x - bounds.width + EDGE_EXPOSED)
    } else if (this.state === EDGE_STATE.DOCKED_RIGHT) {
      this.state = EDGE_STATE.HIDDEN_RIGHT
      this._animateTo(area.x + area.width - EDGE_EXPOSED)
    }

    this.onInteractionChange()
    this.onStateChange()
  }

  show() {
    const win = this.window
    if (!this.isHidden() || this._animating) return
    if (!win || win.isDestroyed()) return

    this.clearHideTimer()
    const area = this.getWorkArea()

    if (this.state === EDGE_STATE.HIDDEN_LEFT) {
      this.state = EDGE_STATE.DOCKED_LEFT
      this._animateTo(area.x)
    } else if (this.state === EDGE_STATE.HIDDEN_RIGHT) {
      const bounds = win.getBounds()
      this.state = EDGE_STATE.DOCKED_RIGHT
      this._animateTo(area.x + area.width - bounds.width)
    }

    this.onInteractionChange()
    this.onStateChange()
  }

  _animateTo(targetX) {
    if (this._animating) return
    this._animating = true

    const win = this.window
    const bounds = win.getBounds()
    const startX = bounds.x
    const startTime = Date.now()

    const tick = () => {
      if (!win || win.isDestroyed()) {
        this._animating = false
        return
      }

      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / EDGE_ANIMATION_MS, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const x = Math.round(startX + (targetX - startX) * eased)

      win.setBounds({ ...bounds, x })

      if (t < 1) {
        this._animFrame = setTimeout(tick, ANIMATION_FRAME_MS)
      } else {
        win.setBounds({ ...bounds, x: targetX })
        this._animating = false
        this._animFrame = null
        this._visibleX = this.isDocked() ? targetX : this._visibleX
        this.onInteractionChange()
        this.onStateChange()
      }
    }

    tick()
  }

  restoreImmediate({ keepDock = false } = {}) {
    this.clearHideTimer()

    if (this._animFrame) {
      clearTimeout(this._animFrame)
      this._animFrame = null
      this._animating = false
    }

    const win = this.window
    if (this.isHidden() && this._visibleX != null && win && !win.isDestroyed()) {
      const bounds = win.getBounds()
      win.setBounds({ ...bounds, x: this._visibleX })
    }

    if (!keepDock) {
      this.state = EDGE_STATE.NORMAL
      this._visibleX = null
    } else if (this.isHidden()) {
      this.state = this.state === EDGE_STATE.HIDDEN_LEFT
        ? EDGE_STATE.DOCKED_LEFT
        : EDGE_STATE.DOCKED_RIGHT
    }
    this.onInteractionChange()
  }

  startMouseWatcher() {
    this.stopMouseWatcher()
    this._pointerTimer = setInterval(() => this._checkMouse(), 50)
  }

  stopMouseWatcher() {
    if (this._pointerTimer) {
      clearInterval(this._pointerTimer)
      this._pointerTimer = null
    }
    this.clearHideTimer()
  }

  _checkMouse() {
    const win = this.window
    if (!win || win.isDestroyed() || !win.isVisible()) return

    const cursor = screen.getCursorScreenPoint()
    const area = this.getWorkArea()

    if (this.isHidden() && !this._animating) {
      if (this.state === EDGE_STATE.HIDDEN_LEFT && cursor.x <= area.x + EDGE_EXPOSED) {
        this.show()
        return
      }
      if (this.state === EDGE_STATE.HIDDEN_RIGHT && cursor.x >= area.x + area.width - EDGE_EXPOSED) {
        this.show()
        return
      }
    }

    if (this.autoHide && this.isDocked() && !this._animating && !this.isPinned && !this.isEditing) {
      const bounds = win.getBounds()
      const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width &&
          cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height
      if (inside) {
        this.clearHideTimer()
      } else if (!this._hideTimer) {
        this.scheduleHide()
      }
    }
  }

  destroy() {
    this.stopMouseWatcher()
    if (this._snapTimer) {
      clearTimeout(this._snapTimer)
      this._snapTimer = null
    }
  }
}
