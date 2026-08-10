import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

/**
 * 通用 Apple 风格弹层定位：
 * - fixed 定位锚定在触发元素下方（可越过 overflow 容器）
 * - 底部空间不足时自动翻转朝上
 * - 点击外部 / Escape 关闭，滚动 / 缩放时跟随重定位
 * options.width：固定弹层宽度（默认跟随触发元素，160~240px）
 */
export function usePopover({ width: fixedWidth = 0 } = {}) {
  const open = ref(false)
  const popStyle = ref(null)
  let triggerEl = null
  let popEl = null
  let height = 240

  function place() {
    if (!triggerEl) return
    const r = triggerEl.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = fixedWidth || Math.min(Math.max(r.width, 160), 240)
    let left = Math.min(r.left, vw - width - 8)
    if (left < 8) left = 8
    let top = r.bottom + 6
    let origin = 'top left'
    if (top + height > vh - 8 && r.top - height - 6 > 8) {
      top = r.top - height - 6
      origin = 'bottom left'
    }
    popStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, '--origin': origin }
  }

  function openWith(trigger) {
    triggerEl = trigger
    open.value = true
    nextTick(() => {
      if (popEl) {
        height = popEl.offsetHeight || height
        place()
      }
    })
  }

  function close(reason = '') {
    open.value = false
    popStyle.value = null
  }

  function toggle(trigger) {
    if (open.value) close('toggle')
    else openWith(trigger)
  }

  function setPopEl(el) {
    popEl = el
  }

  function onPointerDown(e) {
    if (!open.value) return
    const target = e.target
    if ((triggerEl && triggerEl.contains(target)) || (popEl && popEl.contains(target))) return
    close('outside-click')
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && open.value) {
      close('escape')
      triggerEl?.focus()
    }
  }

  function onScroll() {
    if (open.value) place()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
  })

  return { open, popStyle, toggle, close, setPopEl }
}
