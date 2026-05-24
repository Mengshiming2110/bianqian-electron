<template>
  <div
    class="shortcut-editor"
    ref="rootEl"
    tabindex="-1"
    @keydown="onRootKeydown"
  >
    <div class="se-header">
      <span>快捷键设置</span>
      <button class="se-close" type="button" @click="close">&#10005;</button>
    </div>

    <div class="se-body">
      <div
        v-for="item in shortcutList"
        :key="item.id"
        class="se-row"
      >
        <span class="se-label">{{ item.label }}</span>
        <div class="se-binding" :class="{ recording: recordingId === item.id }">
          <span
            v-if="recordingId === item.id"
            class="se-recording"
          >{{ lastCapturedKey || '按下组合键...' }}</span>
          <span
            v-else
            class="se-key"
          >{{ item.binding || '—' }}</span>
        </div>
        <button
          v-if="recordingId === item.id"
          class="se-action se-cancel"
          type="button"
          @click="cancelRecord"
        >&#10005;</button>
        <button
          v-else
          class="se-action"
          type="button"
          @click="startRecord(item.id)"
        >&#9998;</button>
      </div>
    </div>

    <div class="se-footer">
      <button class="se-reset-btn" type="button" @click="resetAll">恢复默认</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const FALLBACK_SHORTCUTS = {
  'toggle-window': 'F3',
  'hide-window': 'Escape',
  'toggle-passthrough': 'Ctrl+Shift+P',
  'category-全部': 'Alt+1',
  'category-工作': 'Alt+2',
  'category-生活': 'Alt+3',
  'category-学习': 'Alt+4',
  'category-会议': 'Alt+5',
  'category-其他': 'Alt+6'
}

const shortcuts = ref({})
const recordingId = ref(null)
const lastCapturedKey = ref('')
const rootEl = ref(null)
let unsubscribeKeydown = null

const shortcutLabels = {
  'toggle-window': '切换窗口显示',
  'hide-window': '隐藏窗口',
  'toggle-passthrough': '穿透模式',
  'category-全部': '分类 — 全部',
  'category-工作': '分类 — 工作',
  'category-生活': '分类 — 生活',
  'category-学习': '分类 — 学习',
  'category-会议': '分类 — 会议',
  'category-其他': '分类 — 其他'
}

const shortcutList = computed(() =>
  Object.entries(shortcuts.value).map(([id, binding]) => ({
    id,
    label: shortcutLabels[id] || id,
    binding
  }))
)

async function load() {
  try {
    const data = await window.api?.shortcuts.list()
    if (data && Object.keys(data).length > 0) {
      shortcuts.value = data
    } else {
      shortcuts.value = { ...FALLBACK_SHORTCUTS }
    }
  } catch {
    shortcuts.value = { ...FALLBACK_SHORTCUTS }
  }
}

function close() {
  window.close()
}

async function startRecord(id) {
  await window.api?.shortcuts.startRecord()
  recordingId.value = id
  lastCapturedKey.value = ''
  await nextTick()
  rootEl.value?.focus()
}

async function cancelRecord() {
  recordingId.value = null
  lastCapturedKey.value = ''
  await window.api?.shortcuts.stopRecord()
}

let lastRecordingTime = 0

function inputToBinding(e) {
  const parts = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  parts.push(key)
  return parts.join('+')
}

function handleKeyCapture(binding) {
  const now = Date.now()
  if (now - lastRecordingTime < 300) return

  if (!recordingId.value) return

  lastRecordingTime = now
  lastCapturedKey.value = binding
  saveRecording(recordingId.value, binding)
}

function onRootKeydown(e) {
  if (!recordingId.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    cancelRecord()
    return
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

  handleKeyCapture(inputToBinding(e))
}

function handleIpcKeydown({ binding, key }) {
  if (!recordingId.value) return
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

  if (key === 'Escape') {
    cancelRecord()
    return
  }

  handleKeyCapture(binding)
}

function handleDomKeydown(e) {
  if (!recordingId.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    cancelRecord()
    return
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

  handleKeyCapture(inputToBinding(e))
}

async function saveRecording(id, binding) {
  try {
    const result = await window.api?.shortcuts.update(id, binding)
    if (result?.ok) {
      shortcuts.value = result.shortcuts
    }
  } finally {
    lastCapturedKey.value = ''
    recordingId.value = null
    await window.api?.shortcuts.stopRecord()
  }
}

async function resetAll() {
  const result = await window.api?.shortcuts.reset()
  if (result?.ok) {
    shortcuts.value = result.shortcuts
  }
}

onMounted(() => {
  load()
  unsubscribeKeydown = window.api?.shortcuts.onKeydown(handleIpcKeydown)
  window.addEventListener('keydown', handleDomKeydown, true)
})

onBeforeUnmount(() => {
  unsubscribeKeydown?.()
  window.removeEventListener('keydown', handleDomKeydown, true)
})
</script>

<style scoped>
.shortcut-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  color: #243230;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 12px;
  user-select: none;
  outline: none;
}

.se-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(47, 125, 120, 0.12);
  border-bottom: 1px solid rgba(47, 125, 120, 0.12);
  font-size: 13px;
  font-weight: 600;
  color: #215d59;
  -webkit-app-region: drag;
}

.se-close {
  border: 0;
  background: none;
  cursor: pointer;
  color: #999;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  -webkit-app-region: no-drag;
}

.se-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.se-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 4px 8px;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid rgba(38, 57, 54, 0.06);
}

.se-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.se-binding {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  min-width: 80px;
  text-align: center;
  background: rgba(47, 125, 120, 0.06);
}

.se-binding.recording {
  background: rgba(47, 125, 120, 0.16);
  border: 1px solid #2f7d78;
  animation: se-pulse 0.8s infinite;
  min-width: 90px;
}

.se-key {
  color: #243230;
}

.se-recording {
  color: #215d59;
  font-size: 10px;
}

.se-action {
  border: 0;
  background: none;
  cursor: pointer;
  color: #2f7d78;
  font-size: 11px;
  padding: 2px;
}

.se-cancel {
  color: #ba4b4b;
}

.se-footer {
  border-top: 1px solid rgba(38, 57, 54, 0.08);
  padding: 8px 12px;
  text-align: right;
}

.se-reset-btn {
  border: 1px solid rgba(38, 57, 54, 0.12);
  border-radius: 6px;
  padding: 5px 14px;
  background: #fff;
  color: #64736f;
  font-size: 11px;
  cursor: pointer;
}

.se-reset-btn:hover {
  background: rgba(47, 125, 120, 0.08);
  color: #215d59;
}

@keyframes se-pulse {
  0%, 100% { border-color: #2f7d78; }
  50%     { border-color: transparent; }
}
</style>
