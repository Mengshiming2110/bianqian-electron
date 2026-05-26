<template>
  <Teleport to="#popover-root">
    <div
      v-if="visible"
      class="attach-popover-wrap"
      :style="wrapStyle"
    >
      <div
        ref="popoverRef"
        class="attach-popover"
        :class="{ closing: isClosing, 'drag-over': dragOver }"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="popover-header">
          <span>附件 ({{ attachments.length }})</span>
          <button class="popover-close" type="button" @click="closePanel">&#10005;</button>
        </div>

        <div class="popover-files">
          <div
            v-for="(file, index) in attachments"
            :key="`${file}-${index}`"
            class="popover-file-row"
          >
            <span class="file-emoji">📄</span>
            <span class="file-name" :title="file" @click="$emit('open', file)">{{ fileName(file) }}</span>
            <button class="file-remove" type="button" @click="$emit('remove', file)">&#10005;</button>
          </div>
        </div>

        <div class="popover-footer">
          <button class="popover-add-btn" type="button" @click="pickFiles">+ 添加附件</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  anchorEl:    { type: Object, default: null },
  visible:     { type: Boolean, default: false },
  maxAttachments: { type: Number, default: 10 }
})

const emit = defineEmits(['close', 'add', 'remove', 'open'])

const isClosing  = ref(false)
const dragOver   = ref(false)
const wrapStyle  = ref({ display: 'none' })
let   closeTimer = null
let   rafId      = null
let   trackingId = null
let   lastStyleKey = ''

const SAFE = 12
const POPOVER_W = 168
const POPOVER_H = 180
const MIN_W = 132
const MIN_H = 120
const GAP = 6

function calcStyle() {
  if (!props.visible || !props.anchorEl) {
    wrapStyle.value = { display: 'none' }
    lastStyleKey = ''
    return
  }

  if (!props.anchorEl.isConnected) {
    wrapStyle.value = { display: 'none' }
    lastStyleKey = ''
    return
  }

  const rect = props.anchorEl.getBoundingClientRect()
  const viewport = window.visualViewport
  const vw = viewport?.width || window.innerWidth
  const vh = viewport?.height || window.innerHeight
  const width = Math.min(POPOVER_W, Math.max(MIN_W, vw - SAFE * 2))
  const height = Math.min(POPOVER_H, Math.max(MIN_H, vh - SAFE * 2))

  const belowSpace = vh - rect.bottom - GAP - SAFE
  const aboveSpace = rect.top - GAP - SAFE
  let top = (belowSpace >= height || belowSpace >= aboveSpace)
    ? rect.bottom + GAP
    : rect.top - height - GAP

  const rightSpace = vw - rect.left - SAFE
  const leftSpace = rect.right - SAFE
  let left = (rightSpace >= width || rightSpace >= leftSpace)
    ? rect.left
    : rect.right - width

  left = Math.max(SAFE, Math.min(left, vw - width - SAFE))
  top = Math.max(SAFE, Math.min(top, vh - height - SAFE))

  const nextStyle = {
    position: 'absolute',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    height: `${Math.round(height)}px`,
    zIndex: 1
  }

  const styleKey = `${nextStyle.top}|${nextStyle.left}|${nextStyle.width}|${nextStyle.height}`
  if (styleKey !== lastStyleKey) {
    lastStyleKey = styleKey
    wrapStyle.value = nextStyle
  }
}

function scheduleCalc() {
  cancelAnimationFrame(rafId)
  nextTick(() => {
    rafId = requestAnimationFrame(calcStyle)
  })
}

watch(
  () => [props.visible, props.anchorEl],
  () => {
    if (props.visible) {
      startTracking()
    } else {
      stopTracking()
      scheduleCalc()
    }
  },
  { immediate: true }
)

function onResize() { scheduleCalc() }

function onScroll() { scheduleCalc() }

function trackAnchor() {
  calcStyle()
  trackingId = requestAnimationFrame(trackAnchor)
}

function startTracking() {
  stopTracking()
  nextTick(() => {
    trackingId = requestAnimationFrame(trackAnchor)
  })
}

function stopTracking() {
  cancelAnimationFrame(trackingId)
  trackingId = null
  lastStyleKey = ''
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  window.visualViewport?.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
  window.visualViewport?.removeEventListener('resize', onResize)
  cancelAnimationFrame(rafId)
  stopTracking()
  clearTimeout(closeTimer)
})

// ── 其余逻辑不变 ──────────────────────────────────────────────

function fileName(path) {
  return path.split(/[\\/]/).pop()
}

function closePanel() {
  isClosing.value = true
  closeTimer = setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, 150)
}

async function pickFiles() {
  const remaining = remainingSlots()
  if (remaining <= 0) return

  const files = await window.api?.files.selectAttachments(remaining)
  if (files?.length) emit('add', files)
}

function remainingSlots() {
  return Math.max(0, props.maxAttachments - props.attachments.length)
}

function onDragOver() { dragOver.value = true }

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOver.value = false
  }
}

async function onDrop(e) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  const paths = window.api?.files.pathsFromFiles(files) || []
  if (!paths.length) return

  const remaining = remainingSlots()
  if (remaining <= 0) return

  emit('add', paths.slice(0, remaining))
}
</script>

<style scoped>
.attach-popover-wrap {
  pointer-events: auto;
}

.attach-popover {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: popIn 180ms ease-out;
  width: 100%;
  height: 100%;
}

.attach-popover.closing {
  animation: popOut 150ms ease-in forwards;
}

@keyframes popIn {
  from { opacity: 0; translate: 0 -6px; }
  to   { opacity: 1; translate: 0 0; }
}

@keyframes popOut {
  from { opacity: 1; translate: 0 0; }
  to   { opacity: 0; translate: 0 -6px; }
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 9px;
  font-size: 11px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
}

.popover-close {
  color: var(--text-muted);
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
}

.popover-files {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 2px;
  min-height: 0;
}

.popover-file-row {
  display: flex;
  align-items: center;
  padding: 4px 5px;
  border-radius: 4px;
  font-size: 11px;
  gap: 5px;
}

.popover-file-row:hover { background: var(--accent-soft); }

.file-emoji { font-size: 12px; flex-shrink: 0; }

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text);
}

.file-name:hover { color: var(--accent); }

.file-remove {
  color: var(--text-muted);
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 10px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}

.file-remove:hover { color: var(--danger); }

.popover-footer {
  border-top: 1px solid var(--border);
  padding: 5px 7px;
}

.popover-add-btn {
  width: 100%;
  border: 0;
  border-radius: 5px;
  padding: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}

.popover-add-btn:hover { filter: brightness(0.92); }
</style>
