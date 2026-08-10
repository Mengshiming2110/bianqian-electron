<template>
  <section class="settings-panel" :data-theme="resolvedTheme">
    <!-- ===== 主视图 ===== -->
    <template v-if="view === 'main'">
      <div class="settings-group">
        <h4 class="group-title">外观</h4>
        <div class="group-card">
          <div class="setting-row">
            <span>窗口透明度</span>
            <div class="stepper-row">
              <input
                :value="opacityStepValue"
                type="range"
                min="35"
                max="100"
                step="5"
                aria-label="窗口透明度"
                @input="setOpacity($event.target.value)"
              />
              <strong>{{ opacityStepValue }}%</strong>
            </div>
          </div>
          <button class="setting-row menu" type="button" @click="view = 'themes'">
            <span>主题</span>
            <small>{{ themeLabel }}<ChevronRight :size="14" /></small>
          </button>
          <button class="setting-row menu" type="button" @click="view = 'modes'">
            <span>显示预设</span>
            <small>{{ activePresetLabel }}<ChevronRight :size="14" /></small>
          </button>
        </div>
      </div>

      <div class="settings-group">
        <h4 class="group-title">剪切板</h4>
        <div class="group-card">
          <div class="setting-row">
            <span>历史记录上限</span>
            <div class="setting-select">
              <SelectMenu v-model="clipboardLimit" :options="clipboardLimitOptions" @change="saveClipboardLimit" />
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h4 class="group-title">邮件</h4>
        <div class="group-card">
          <div class="setting-row">
            <span>自动拉取间隔</span>
            <div class="setting-select">
              <SelectMenu v-model="mailInterval" :options="mailIntervalOptions" @change="saveMailInterval" />
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h4 class="group-title">系统</h4>
        <div class="group-card">
          <div class="setting-row">
            <span>开机自启动</span>
            <input type="checkbox" class="switch" v-model="autoStart" @change="saveAutoStart" />
          </div>
          <div class="setting-row">
            <span>贴边自动收起</span>
            <input
              type="checkbox"
              class="switch"
              :checked="state.edgeAutoHide"
              @change="toggleEdgeAutoHide"
            />
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h4 class="group-title">分类与快捷键</h4>
        <div class="group-card">
          <button class="setting-row menu" type="button" @click="view = 'categories'">
            <span>分类筛选</span>
            <small>{{ state.activeCategory }}<ChevronRight :size="14" /></small>
          </button>
          <button class="setting-row menu" type="button" @click="enterShortcuts">
            <span>快捷键设置</span>
            <small>{{ shortcutsHint }}<ChevronRight :size="14" /></small>
          </button>
        </div>
      </div>

      <div class="settings-version">v1.0.1</div>
    </template>

    <!-- ===== 分类筛选 ===== -->
    <template v-else-if="view === 'categories'">
      <div class="sub-header">
        <button class="icon-btn" type="button" title="返回" @click="view = 'main'">
          <ArrowLeft :size="16" />
        </button>
        <h2 class="sub-title">分类筛选</h2>
      </div>
      <div class="group-card">
        <button
          v-for="cat in allCategories"
          :key="cat"
          class="list-row"
          :class="{ active: state.activeCategory === cat }"
          type="button"
          @click="selectCategory(cat)"
        >
          <span>{{ cat }}</span>
          <Check v-if="state.activeCategory === cat" :size="14" />
        </button>
      </div>
    </template>

    <!-- ===== 主题 ===== -->
    <template v-else-if="view === 'themes'">
      <div class="sub-header">
        <button class="icon-btn" type="button" title="返回" @click="view = 'main'">
          <ArrowLeft :size="16" />
        </button>
        <h2 class="sub-title">主题</h2>
      </div>
      <div class="group-card">
        <button
          class="list-row"
          :class="{ active: state.theme === 'system' }"
          type="button"
          @click="setTheme('system')"
        >
          <span>跟随系统</span>
          <small>自动切换</small>
          <Check v-if="state.theme === 'system'" :size="14" />
        </button>
        <button
          class="list-row"
          :class="{ active: state.theme === 'light' }"
          type="button"
          @click="setTheme('light')"
        >
          <span>浅色</span>
          <Sun :size="15" />
          <Check v-if="state.theme === 'light'" :size="14" />
        </button>
        <button
          class="list-row"
          :class="{ active: state.theme === 'dark' }"
          type="button"
          @click="setTheme('dark')"
        >
          <span>深色</span>
          <Moon :size="15" />
          <Check v-if="state.theme === 'dark'" :size="14" />
        </button>
      </div>
    </template>

    <!-- ===== 快捷键 ===== -->
    <template v-else-if="view === 'shortcuts'">
      <div class="sub-header">
        <button class="icon-btn" type="button" title="返回" @click="backFromShortcuts">
          <ArrowLeft :size="16" />
        </button>
        <h2 class="sub-title">快捷键设置</h2>
      </div>
      <div class="shortcut-list">
        <div v-for="group in shortcutGroups" :key="group.id" class="shortcut-group">
          <div class="group-title">{{ group.label }}</div>
          <div v-for="item in group.items" :key="item.id" class="shortcut-card">
            <div class="shortcut-card-head">
              <span class="shortcut-name">{{ item.label }}</span>
              <span class="shortcut-scope" :class="item.scope">{{ scopeLabel(item.scope) }}</span>
            </div>
            <div class="shortcut-desc">{{ item.description }}</div>
            <div class="shortcut-card-actions">
              <template v-if="recordingId !== item.id">
                <span class="shortcut-chip" :class="{ empty: !shortcuts[item.id] }">
                  {{ shortcuts[item.id] || '未设置' }}
                </span>
                <button class="sc-btn" type="button" @click="startRecord(item.id)">编辑</button>
                <button v-if="shortcuts[item.id]" class="sc-btn" type="button" @click="clearShortcut(item.id)">清除</button>
                <button v-if="shortcuts[item.id] !== item.default" class="sc-btn" type="button" @click="resetOne(item.id)">默认</button>
              </template>
              <template v-else-if="!pendingBinding">
                <span class="shortcut-chip recording">按下组合键…</span>
                <button class="sc-btn" type="button" @click="cancelRecord">取消</button>
              </template>
              <template v-else>
                <span class="shortcut-chip captured">{{ pendingBinding }}</span>
                <button class="sc-btn primary" type="button" @click="confirmSave(item.id)">保存</button>
                <button class="sc-btn" type="button" @click="cancelRecord">取消</button>
              </template>
            </div>
            <div v-if="recordingId === item.id && pendingBinding && conflictLabelFor(item.id)" class="shortcut-conflict">
              ⚠ 与「{{ conflictLabelFor(item.id) }}」冲突，保存将覆盖
            </div>
          </div>
        </div>
        <div v-if="shortcutToast" class="shortcut-toast">{{ shortcutToast }}</div>
        <div class="shortcut-footer">
          <button class="se-reset-btn" type="button" @click="resetAllShortcuts">恢复全部默认</button>
        </div>
      </div>
    </template>

    <!-- ===== 显示预设 ===== -->
    <template v-else>
      <div class="sub-header">
        <button class="icon-btn" type="button" title="返回" @click="view = 'main'">
          <ArrowLeft :size="16" />
        </button>
        <h2 class="sub-title">显示预设</h2>
      </div>
      <div class="group-card">
        <button
          v-for="preset in modePresets"
          :key="preset.id"
          class="list-row"
          type="button"
          @click="applyPreset(preset)"
        >
          <span>{{ preset.label }}</span>
          <small>{{ Math.round(preset.opacity * 100) }}%</small>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ArrowLeft, Check, ChevronRight, Moon, Sun } from 'lucide-vue-next'
import { useMailStore } from '../stores/mail'
import SelectMenu from './SelectMenu.vue'
import {
  SHORTCUT_GROUPS,
  ALL_SHORTCUT_ITEMS,
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS
} from '../lib/shortcutDefs.js'

const emit = defineEmits(['close', 'theme-change'])

const view = ref('main')
const mailStore = useMailStore()
const state = reactive({
  opacity: 0.92,
  theme: 'system',
  passThrough: false,
  edgeAutoHide: false,
  activeCategory: '全部'
})

const clipboardLimit = ref(50)
const autoStart = ref(false)
const mailInterval = ref(5)

const clipboardLimitOptions = [
  { value: 20, label: '20 条' },
  { value: 50, label: '50 条' },
  { value: 100, label: '100 条' }
]
const mailIntervalOptions = [
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' }
]

const shortcutGroups = SHORTCUT_GROUPS
const shortcuts = ref({})
const recordingId = ref(null)
const pendingBinding = ref('')
const shortcutToast = ref('')
let toastTimer = null

const allCategories = ref(['全部', '工作', '生活', '学习', '会议', '其他'])

const modePresets = [
  { id: 'default', label: '常规', opacity: 0.92, passThrough: false },
  { id: 'focus', label: '清晰', opacity: 1, passThrough: false },
  { id: 'meeting', label: '演示', opacity: 0.72, passThrough: true }
]

const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
let darkModeMq = null
let onDarkModeChange = null

const opacityStepValue = computed(() => Math.round(state.opacity * 100 / 5) * 5)

const themeLabel = computed(() => {
  const map = { system: '跟随系统', light: '浅色', dark: '深色' }
  return map[state.theme] || '跟随系统'
})

const resolvedTheme = computed(() => {
  if (state.theme === 'system') {
    return systemDark.value ? 'dark' : 'light'
  }
  return state.theme
})

// 主题偏好变化通知宿主（App.vue 应用到全局 data-theme）
watch(() => state.theme, (theme) => {
  emit('theme-change', theme)
}, { immediate: true })

const activePresetLabel = computed(() => {
  const pct = Math.round(state.opacity * 100)
  if (state.passThrough) return '演示'
  if (pct >= 99) return '清晰'
  return '常规'
})

const shortcutsHint = computed(() => {
  const tw = shortcuts.value['toggle-window']
  return tw ? `主键 ${tw}` : '点击设置'
})

async function loadSettings() {
  const settings = await window.api?.settings?.get()
  if (settings) {
    clipboardLimit.value = settings.clipboardLimit || 50
    autoStart.value = settings.autoStart || false
    mailInterval.value = settings.mailInterval || 5
  }
}

async function saveClipboardLimit() {
  await window.api?.settings?.save({ clipboardLimit: clipboardLimit.value })
}

async function saveAutoStart() {
  await window.api?.settings?.save({ autoStart: autoStart.value })
}

async function saveMailInterval() {
  await window.api?.settings?.save({ mailInterval: mailInterval.value })
  if (mailStore.isRunning) {
    await mailStore.startAutoFetch()
  }
}

let unsubInteraction = null
let unsubFilterCategory = null

onMounted(async () => {
  darkModeMq = window.matchMedia('(prefers-color-scheme: dark)')
  onDarkModeChange = (e) => { systemDark.value = e.matches }
  darkModeMq.addEventListener('change', onDarkModeChange)

  await loadSettings()

  if (window.api?.window?.getInteractionState) {
    const s = await window.api.window.getInteractionState()
    if (s) {
      state.opacity = s.opacity
      state.theme = s.theme
      state.passThrough = s.passThrough
      state.edgeAutoHide = s.edgeAutoHide
    }
  }

  if (window.api?.categories?.list) {
    try {
      const result = await window.api.categories.list()
      if (result?.allCategory && !allCategories.value.includes(result.allCategory)) {
        allCategories.value.unshift(result.allCategory)
      }
    } catch {}
  }

  if (window.api?.window?.onInteractionState) {
    unsubInteraction = window.api.window.onInteractionState((s) => {
      if (s) {
        state.opacity = s.opacity
        state.theme = s.theme
        state.passThrough = s.passThrough
        state.edgeAutoHide = s.edgeAutoHide
      }
    })
  }

  if (window.api?.window?.onFilterCategory) {
    unsubFilterCategory = window.api.window.onFilterCategory((cat) => {
      if (cat) state.activeCategory = cat
    })
  }

  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  if (unsubInteraction) unsubInteraction()
  if (unsubFilterCategory) unsubFilterCategory()
  if (darkModeMq && onDarkModeChange) darkModeMq.removeEventListener('change', onDarkModeChange)
  cancelRecord()
  if (toastTimer) clearTimeout(toastTimer)
  document.removeEventListener('keydown', onKeydown, true)
})

function onKeydown(e) {
  if (recordingId.value) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      cancelRecord()
      return
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
    pendingBinding.value = inputToBinding(e)
    return
  }

  if (e.key === 'Escape') {
    if (view.value !== 'main') {
      view.value = 'main'
    } else {
      emit('close')
    }
  }
}

function scopeLabel(scope) {
  return scope === 'global' ? '全局' : '窗口'
}

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

async function loadShortcuts() {
  try {
    const data = await window.api?.shortcuts?.list()
    shortcuts.value = data && Object.keys(data).length ? data : { ...DEFAULT_SHORTCUTS }
  } catch {
    shortcuts.value = { ...DEFAULT_SHORTCUTS }
  }
}

function clearToastSoon() {
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { shortcutToast.value = '' }, 2500)
}

async function enterShortcuts() {
  shortcutToast.value = ''
  await loadShortcuts()
  view.value = 'shortcuts'
}

async function backFromShortcuts() {
  await cancelRecord()
  view.value = 'main'
}

async function startRecord(id) {
  shortcutToast.value = ''
  pendingBinding.value = ''
  await window.api?.shortcuts?.startRecord()
  recordingId.value = id
}

async function cancelRecord() {
  if (!recordingId.value) return
  recordingId.value = null
  pendingBinding.value = ''
  await window.api?.shortcuts?.stopRecord()
}

async function confirmSave(id) {
  const binding = pendingBinding.value
  try {
    const result = await window.api?.shortcuts?.update(id, binding)
    if (result?.ok) {
      shortcuts.value = result.shortcuts
      if (result.conflicts?.length) {
        const names = result.conflicts.map((cid) => SHORTCUT_LABELS[cid] || cid).join('、')
        shortcutToast.value = `已覆盖：${names}`
      } else {
        shortcutToast.value = '已保存'
      }
    } else {
      shortcutToast.value = result?.error || '保存失败'
    }
  } catch {
    shortcutToast.value = '保存失败'
  } finally {
    recordingId.value = null
    pendingBinding.value = ''
    await window.api?.shortcuts?.stopRecord()
    clearToastSoon()
  }
}

async function clearShortcut(id) {
  shortcutToast.value = ''
  try {
    const result = await window.api?.shortcuts?.update(id, '')
    if (result?.ok) {
      shortcuts.value = result.shortcuts
      shortcutToast.value = '已清除'
    } else {
      shortcutToast.value = result?.error || '清除失败'
    }
  } catch {
    shortcutToast.value = '清除失败'
  }
  clearToastSoon()
}

async function resetOne(id) {
  shortcutToast.value = ''
  try {
    const result = await window.api?.shortcuts?.update(id, DEFAULT_SHORTCUTS[id])
    if (result?.ok) {
      shortcuts.value = result.shortcuts
      shortcutToast.value = '已恢复默认'
    } else {
      shortcutToast.value = result?.error || '恢复失败'
    }
  } catch {
    shortcutToast.value = '恢复失败'
  }
  clearToastSoon()
}

async function resetAllShortcuts() {
  shortcutToast.value = ''
  try {
    const result = await window.api?.shortcuts?.reset()
    if (result?.ok) {
      shortcuts.value = result.shortcuts
      shortcutToast.value = '已恢复全部默认'
    } else {
      shortcutToast.value = result?.error || '重置失败'
    }
  } catch {
    shortcutToast.value = '重置失败'
  }
  clearToastSoon()
}

function conflictLabelFor(id) {
  if (!pendingBinding.value) return null
  for (const item of ALL_SHORTCUT_ITEMS) {
    if (item.id === id) continue
    if (shortcuts.value[item.id] === pendingBinding.value) {
      return item.label
    }
  }
  return null
}

async function setOpacity(val) {
  const v = Math.max(35, Math.min(100, Number(val)))
  state.opacity = v / 100
  if (window.api?.window?.setOpacity) {
    const s = await window.api.window.setOpacity(state.opacity)
    if (s) state.opacity = s.opacity
  }
}

async function setTheme(theme) {
  state.theme = theme
  if (window.api?.window?.setTheme) {
    const s = await window.api.window.setTheme(theme)
    if (s) state.theme = s.theme
  }
}

async function toggleEdgeAutoHide() {
  if (window.api?.window?.setEdgeAutoHide) {
    const s = await window.api.window.setEdgeAutoHide(!state.edgeAutoHide)
    if (s) state.edgeAutoHide = s.edgeAutoHide
  }
}

async function selectCategory(cat) {
  state.activeCategory = cat
  if (window.api?.window?.show) {
    await window.api.window.show(cat)
  }
  view.value = 'main'
}

async function applyPreset(preset) {
  if (window.api?.window?.setOpacity) {
    const s = await window.api.window.setOpacity(preset.opacity)
    if (s) state.opacity = s.opacity
  }
  if (preset.passThrough && window.api?.window?.setPassThrough) {
    await window.api.window.setPassThrough(true)
    state.passThrough = true
  } else if (state.passThrough && window.api?.window?.setPassThrough) {
    await window.api.window.setPassThrough(false)
    state.passThrough = false
  }
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 设置行右侧值 + 箭头 */
.setting-row small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.setting-row small svg {
  flex: none;
  opacity: 0.7;
}

/* 子视图页头 */
.sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 10px;
}

.sub-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--apple-foreground);
}

/* 分组卡片行 */
.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-bottom: 1px solid var(--apple-border);
  background: transparent;
  color: var(--apple-foreground);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s var(--ease-out);
}

.list-row:last-child {
  border-bottom: 0;
}

.list-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-row small {
  color: var(--apple-muted-foreground);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.list-row.active {
  color: var(--apple-primary);
}

.list-row.active small {
  color: var(--apple-primary);
}

/* 透明度滑杆 */
.stepper-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.stepper-row input[type="range"] {
  width: 110px;
  accent-color: var(--apple-primary);
}

.stepper-row strong {
  min-width: 34px;
  text-align: right;
  font-size: 12px;
  color: var(--apple-foreground);
}

/* 版本号 */
.settings-version {
  text-align: center;
  font-size: 10px;
  color: var(--apple-muted-foreground);
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--apple-border);
}

/* 自定义下拉 */
.setting-select {
  width: 140px;
  flex: none;
}

/* 快捷键 */
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shortcut-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shortcut-card {
  padding: 10px 12px;
  border-radius: var(--apple-radius-md);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  box-shadow: var(--shadow-xs);
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}

.shortcut-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.shortcut-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.shortcut-scope {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--brand-soft);
  color: var(--apple-primary);
  white-space: nowrap;
}

.shortcut-scope.window {
  background: var(--apple-muted);
  color: var(--apple-muted-foreground);
}

.shortcut-desc {
  font-size: 11px;
  color: var(--apple-muted-foreground);
  margin-top: 3px;
  line-height: 1.4;
}

.shortcut-card-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.shortcut-chip {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 4px 8px;
  border-radius: var(--apple-radius-sm);
  background: var(--brand-soft);
  color: var(--apple-foreground);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid transparent;
}

.shortcut-chip.empty {
  color: var(--apple-muted-foreground);
  font-style: italic;
  font-family: inherit;
}

.shortcut-chip.recording {
  background: var(--brand-soft);
  border-color: var(--apple-ring);
  color: var(--apple-primary);
  font-family: inherit;
  animation: sc-pulse 0.9s infinite;
}

.shortcut-chip.captured {
  background: var(--apple-primary);
  border-color: var(--apple-primary);
  color: var(--apple-primary-foreground);
}

.sc-btn {
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-sm);
  background: var(--apple-background);
  color: var(--apple-foreground);
  font-size: 10px;
  padding: 4px 9px;
  cursor: pointer;
  white-space: nowrap;
}

.sc-btn:hover {
  background: var(--brand-soft);
  color: var(--apple-primary);
  border-color: var(--apple-ring);
}

.sc-btn.primary {
  background: var(--apple-primary);
  color: var(--apple-primary-foreground);
  border-color: var(--apple-primary);
}

.sc-btn.primary:hover {
  filter: brightness(0.95);
  color: var(--apple-primary-foreground);
}

.shortcut-conflict {
  font-size: 10px;
  color: var(--warning);
  margin-top: 6px;
  line-height: 1.3;
}

.shortcut-toast {
  font-size: 11px;
  color: var(--apple-primary);
  text-align: center;
  padding: 6px 4px;
}

.shortcut-footer {
  border-top: 1px solid var(--apple-border);
  padding: 8px 2px;
  display: flex;
  justify-content: flex-end;
}

.se-reset-btn {
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  background: var(--apple-background);
  color: var(--apple-muted-foreground);
  font-size: 11px;
  cursor: pointer;
}

.se-reset-btn:hover {
  background: var(--brand-soft);
  color: var(--apple-primary);
  border-color: var(--apple-ring);
}

@keyframes sc-pulse {
  0%, 100% { border-color: var(--apple-ring); }
  50%     { border-color: transparent; }
}

@media (hover: hover) and (pointer: fine) {
  .list-row:hover {
    background: var(--apple-accent);
  }
}
</style>
