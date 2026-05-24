<template>
  <Teleport to="#popover-root">
    <div
      v-if="visible"
      class="attach-popover-anchor"
      :style="popoverStyle"
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
import { computed, ref } from 'vue'

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  anchorRight: { type: Number, default: 0 },
  anchorBottom: { type: Number, default: 0 },
  anchorTop: { type: Number, default: 0 },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'add', 'remove', 'open'])

const isClosing = ref(false)
const dragOver = ref(false)
const closeTimer = ref(null)

function fileName(path) {
  return path.split(/[\\/]/).pop()
}

function closePanel() {
  isClosing.value = true
  closeTimer.value = setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, 150)
}

async function pickFiles() {
  const files = await window.api?.files.selectAttachments()
  if (files?.length) emit('add', files)
}

function onDragOver() {
  dragOver.value = true
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOver.value = false
  }
}

function onDrop(e) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  const paths = []
  for (const f of files) {
    if (f.path) paths.push(f.path)
  }
  if (paths.length) emit('add', paths)
}

const popoverStyle = computed(() => {
  if (!props.visible) return { display: 'none' }
  const pw = 200
  const gap = 4
  const maxH = 280

  let top = props.anchorBottom + gap
  let left = props.anchorRight - pw

  if (left < 8) left = 8
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8

  if (top + maxH > window.innerHeight - 8) {
    top = props.anchorTop - maxH - gap
    if (top < 8) top = 8
  }

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${pw}px`,
    zIndex: 9999
  }
})
</script>

<style scoped>
.attach-popover-anchor {
  /* position: fixed comes from JS, no transform here */
}

.attach-popover {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(47, 125, 120, 0.22);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(32, 44, 42, 0.18);
  backdrop-filter: blur(14px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: popIn 180ms ease-out;
  transform-origin: top right;
  width: 100%;
  max-height: 280px;
}

.attach-popover.closing {
  animation: popOut 150ms ease-in forwards;
}

@keyframes popIn {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

@keyframes popOut {
  from { transform: scale(1); opacity: 1; }
  to   { transform: scale(0); opacity: 0; }
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 9px;
  font-size: 11px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-bottom: 1px solid rgba(47, 125, 120, 0.1);
}

.popover-close {
  color: #bbb;
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

.popover-file-row:hover {
  background: rgba(0, 0, 0, 0.03);
}

.file-emoji {
  font-size: 12px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text);
}

.file-name:hover {
  color: var(--accent);
}

.file-remove {
  color: #ccc;
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 10px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}

.file-remove:hover {
  color: var(--danger);
}

.popover-footer {
  border-top: 1px solid rgba(47, 125, 120, 0.07);
  padding: 5px 7px;
}

.popover-add-btn {
  width: 100%;
  border: 0;
  border-radius: 5px;
  padding: 5px;
  background: rgba(47, 125, 120, 0.08);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}

.popover-add-btn:hover {
  background: rgba(47, 125, 120, 0.15);
}
</style>
