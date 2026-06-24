<template>
  <div class="settings-shell" :data-theme="resolvedTheme">
    <section class="settings-card">
      <template v-if="view === 'main'">
        <div class="settings-card-header">
          <Settings :size="16" />
          <span>设置</span>
          <button class="close-btn" type="button" @click="close">
            <X :size="14" />
          </button>
        </div>
        <div class="settings-slider-row">
          <SlidersHorizontal :size="15" />
          <span class="settings-slider-label">透明度</span>
          <input
            :value="Math.round(state.opacity * 100)"
            type="range"
            min="35"
            max="100"
            step="5"
            @input="setOpacity($event.target.value)"
          />
          <strong>{{ Math.round(state.opacity * 100) }}%</strong>
        </div>
        <button class="settings-menu-row" type="button" @click="view = 'categories'">
          <span>分类筛选</span>
          <small>{{ state.activeCategory }}</small>
          <ChevronRight :size="15" />
        </button>
        <button class="settings-menu-row" type="button" @click="view = 'modes'">
          <span>显示预设</span>
          <small>{{ activePresetLabel }}</small>
          <ChevronRight :size="15" />
        </button>
        <button class="settings-menu-row" type="button" @click="view = 'themes'">
          <span>主题</span>
          <small>{{ themeLabel }}</small>
          <ChevronRight :size="15" />
        </button>
        <div class="settings-status-list">
          <div class="settings-status-row">
            <span>鼠标穿透</span>
            <small>{{ state.passThrough ? '已开启' : '托盘/快捷键' }}</small>
          </div>
          <div class="settings-status-row">
            <span>贴边收纳</span>
            <small>{{ state.edgeAutoHide ? '自动收起' : '只吸附不收起' }}</small>
          </div>
        </div>
        <button class="settings-toggle-row" type="button" @click="toggleEdgeAutoHide">
          <span>贴边自动收起</span>
          <small>{{ state.edgeAutoHide ? '离开鼠标后只露出边缘' : '拖到边缘时固定停靠' }}</small>
          <span class="toggle-switch" :class="{ on: state.edgeAutoHide }"></span>
        </button>

        <!-- 剪切板设置 -->
        <div class="setting-group">
          <h4>剪切板</h4>
          <div class="setting-row">
            <span>历史记录上限</span>
            <select v-model="clipboardLimit" @change="saveClipboardLimit">
              <option :value="20">20 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
          </div>
        </div>

        <!-- 系统设置 -->
        <div class="setting-group">
          <h4>系统</h4>
          <div class="setting-row">
            <span>开机自启动</span>
            <input type="checkbox" v-model="autoStart" @change="saveAutoStart" />
          </div>
          <div class="setting-row">
            <span>邮件拉取间隔</span>
            <select v-model="mailInterval" @change="saveMailInterval">
              <option :value="1">1 分钟</option>
              <option :value="5">5 分钟</option>
              <option :value="15">15 分钟</option>
              <option :value="30">30 分钟</option>
            </select>
          </div>
        </div>

        <button class="settings-menu-row" type="button" @click="openShortcutEditor">
          <span>快捷键设置</span>
          <small>F3 / Esc / Ctrl+Shift+P ...</small>
          <ChevronRight :size="15" />
        </button>

        <!-- 版本号 -->
        <div style="text-align:center;color:var(--text-tertiary);font-size:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          v1.0.0
        </div>
      </template>

      <template v-else-if="view === 'categories'">
        <div class="settings-card-header">
          <button class="settings-back-button" type="button" @click="view = 'main'">
            <ArrowLeft :size="15" />
          </button>
          <span>分类筛选</span>
        </div>
        <button
          v-for="cat in allCategories"
          :key="cat"
          class="settings-list-row"
          :class="{ active: state.activeCategory === cat }"
          type="button"
          @click="selectCategory(cat)"
        >
          <span>{{ cat }}</span>
        </button>
      </template>

      <template v-else-if="view === 'themes'">
        <div class="settings-card-header">
          <button class="settings-back-button" type="button" @click="view = 'main'">
            <ArrowLeft :size="15" />
          </button>
          <span>主题</span>
        </div>
        <button
          class="settings-list-row"
          :class="{ active: state.theme === 'system' }"
          type="button"
          @click="setTheme('system')"
        >
          <span>跟随系统</span>
          <small>自动切换</small>
        </button>
        <button
          class="settings-list-row"
          :class="{ active: state.theme === 'light' }"
          type="button"
          @click="setTheme('light')"
        >
          <span>浅色</span>
          <Sun :size="15" />
        </button>
        <button
          class="settings-list-row"
          :class="{ active: state.theme === 'dark' }"
          type="button"
          @click="setTheme('dark')"
        >
          <span>深色</span>
          <Moon :size="15" />
        </button>
      </template>

      <template v-else>
        <div class="settings-card-header">
          <button class="settings-back-button" type="button" @click="view = 'main'">
            <ArrowLeft :size="15" />
          </button>
          <span>显示预设</span>
        </div>
        <button
          class="settings-list-row"
          :class="{ active: true }"
          type="button"
          @click="selectMode('normal')"
        >
          <span>标准视图</span>
          <small>备忘、剪切板、邮件统一高度</small>
        </button>
        <div class="settings-divider"></div>
        <button
          v-for="preset in modePresets"
          :key="preset.id"
          class="settings-list-row"
          type="button"
          @click="applyPreset(preset)"
        >
          <span>{{ preset.label }}</span>
          <small>{{ Math.round(preset.opacity * 100) }}%</small>
        </button>
      </template>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  ArrowLeft,
  ChevronRight,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-vue-next'
import { useMailStore } from '../stores/mail'

const view = ref('main')
const mailStore = useMailStore()
const state = reactive({
  opacity: 0.92,
  windowMode: 'normal',
  theme: 'system',
  passThrough: false,
  edgeAutoHide: false,
  activeCategory: '全部'
})

const clipboardLimit = ref(50)
const autoStart = ref(false)
const mailInterval = ref(5)

const allCategories = ['全部', '工作', '生活', '学习', '会议', '其他']

const modePresets = [
  { id: 'default', label: '常规', opacity: 0.92, passThrough: false, mode: 'normal' },
  { id: 'focus', label: '清晰', opacity: 1, passThrough: false, mode: 'normal' },
  { id: 'meeting', label: '演示', opacity: 0.72, passThrough: true, mode: 'normal' }
]

const resolvedTheme = computed(() => {
  if (state.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return state.theme
})

const themeLabel = computed(() => {
  const map = { system: '跟随系统', light: '浅色', dark: '深色' }
  return map[state.theme] || '跟随系统'
})

const activePresetLabel = computed(() => {
  const pct = Math.round(state.opacity * 100)
  if (state.passThrough) return '演示'
  if (pct >= 99) return '清晰'
  return '常规'
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

onMounted(async () => {
  await loadSettings()

  if (window.api?.window?.getInteractionState) {
    const s = await window.api.window.getInteractionState()
    if (s) {
      state.opacity = s.opacity
      state.windowMode = s.windowMode
      state.theme = s.theme
      state.passThrough = s.passThrough
      state.edgeAutoHide = s.edgeAutoHide
    }
  }

  if (window.api?.categories?.list) {
    try {
      const result = await window.api.categories.list()
      if (result?.allCategory && !allCategories.includes(result.allCategory)) {
        allCategories.unshift(result.allCategory)
      }
    } catch {}
  }

  if (window.api?.window?.onInteractionState) {
    unsubInteraction = window.api.window.onInteractionState((s) => {
      if (s) {
        state.opacity = s.opacity
        state.windowMode = s.windowMode
        state.theme = s.theme
        state.passThrough = s.passThrough
        state.edgeAutoHide = s.edgeAutoHide
      }
    })
  }

  if (window.api?.window?.onFilterCategory) {
    window.api.window.onFilterCategory((cat) => {
      if (cat) state.activeCategory = cat
    })
  }

  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (unsubInteraction) unsubInteraction()
  document.removeEventListener('keydown', onKeydown)
})

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (view.value !== 'main') {
      view.value = 'main'
    } else {
      close()
    }
  }
}

function openShortcutEditor() {
  window.api?.shortcuts?.openEditor()
}

function close() {
  window.api?.settingsWindow?.close()
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

async function selectMode(mode) {
  if (window.api?.window?.setMode) {
    const s = await window.api.window.setMode('normal')
    if (s) state.windowMode = s.windowMode
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
  }
  if (preset.mode && window.api?.window?.setMode) {
    const s = await window.api.window.setMode(preset.mode)
    if (s) state.windowMode = s.windowMode
  }
}
</script>

<style scoped>
.settings-shell {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.settings-card {
  display: grid;
  gap: 7px;
  padding: 8px;
  border-radius: var(--radius-window);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
  color: var(--text);
  height: 100%;
  overflow-y: auto;
  align-content: start;
}

.settings-card-header {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.settings-card-header .close-btn {
  margin-left: auto;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.settings-card-header .close-btn:hover {
  background: var(--accent-soft);
  color: var(--text);
}

.settings-slider-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 9px;
  color: var(--text-muted);
}

.settings-slider-row input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
  height: 4px;
}

.settings-slider-label {
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}

.settings-slider-row strong {
  min-width: 36px;
  text-align: right;
  color: var(--text);
  font-size: 12px;
}

.settings-menu-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.settings-menu-row:hover {
  background: var(--accent-soft);
}

.settings-menu-row span {
  flex: 1;
}

.settings-menu-row small {
  color: var(--text-muted);
  font-size: 12px;
}

.settings-status-list {
  display: grid;
  gap: 4px;
  padding: 4px 9px;
}

.settings-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.settings-status-row small {
  font-size: 11px;
}

.settings-toggle-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  align-items: center;
  padding: 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--bg-input);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-toggle-row:hover {
  background: var(--accent-soft);
}

.settings-toggle-row small {
  color: var(--text-muted);
  font-size: 11px;
}

.toggle-switch {
  grid-row: 1 / span 2;
  grid-column: 2;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  transition: background 0.16s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-elevated);
  box-shadow: 0 1px 3px rgba(15, 35, 33, 0.22);
  transition: transform 0.16s ease;
}

.toggle-switch.on {
  background: var(--accent);
}

.toggle-switch.on::after {
  transform: translateX(14px);
}

.settings-back-button {
  padding: 4px;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.settings-back-button:hover {
  background: var(--accent-soft);
  color: var(--text);
}

.settings-list-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.settings-list-row:hover {
  background: var(--accent-soft);
}

.settings-list-row.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.settings-list-row span {
  flex: 1;
}

.settings-list-row small {
  color: var(--text-muted);
  font-size: 12px;
}

.settings-divider {
  height: 1px;
  margin: 4px 9px;
  background: var(--border);
}

.setting-group {
  padding: 6px 9px 2px;
}

.setting-group h4 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text);
}

.setting-row select {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.setting-row input[type="checkbox"] {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
}
</style>
