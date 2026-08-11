<template>
  <div class="note-popout popout-enter" :class="note.color ? 'color-' + note.color : ''" :style="{ opacity: opacity / 100 }" @animationend="onEnterEnd">
    <header class="popout-header">
      <span class="note-dot" aria-hidden="true"></span>
      <strong>{{ note.title }}</strong>
      <button
        class="head-btn pin-btn"
        :class="{ active: pinned }"
        :title="pinned ? '取消置顶' : '置顶窗口'"
        type="button"
        @click="togglePin"
      ><Pin :size="14" /></button>
      <button
        class="head-btn opacity-btn"
        :class="{ active: opacityOpen }"
        :title="'透明度 ' + opacity + '%'"
        type="button"
        @click="opacityOpen = !opacityOpen"
      ><Droplet :size="14" /></button>
      <button class="head-btn close-btn" title="关闭" type="button" @click="close">
        <X :size="14" />
      </button>
    </header>
    <div v-if="opacityOpen" class="opacity-pop">
      <Droplet :size="13" class="opacity-pop-icon" />
      <input type="range" min="30" max="100" step="5" :value="opacity" aria-label="窗口透明度" @input="setOpacity($event.target.value)" />
      <span class="opacity-pop-value">{{ opacity }}%</span>
    </div>
    <section class="popout-body">
      <MarkdownPreview v-if="note.content" :content="note.content" :is-mini="false" class="popout-preview" />
      <p v-else class="empty-hint">暂无内容</p>
    </section>
    <footer class="popout-footer">
      <span class="category-pill">{{ note.category }}</span>
      <time>{{ note.date }} {{ note.time }}</time>
    </footer>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { X, Pin, Droplet } from 'lucide-vue-next'
import MarkdownPreview from './MarkdownPreview.vue'

const props = defineProps({
  noteId: { type: String, required: true }
})

const note = reactive({
  title: '',
  content: '',
  category: '',
  color: '',
  date: '',
  time: ''
})

// 置顶：窗口创建时默认置顶（主进程 alwaysOnTop: true）
const pinned = ref(true)
// 透明度：localStorage 持久化（30% ~ 100%），transparent 窗口直接用 CSS opacity
const OPACITY_KEY = 'note-popout-opacity'
const opacity = ref(100)
const opacityOpen = ref(false)
try {
  const saved = Number(localStorage.getItem(OPACITY_KEY))
  if (saved >= 30 && saved <= 100) opacity.value = saved
} catch {}

let unsubNoteData = null

onMounted(async () => {
  if (window.api?.noteWindow?.onData) {
    unsubNoteData = window.api.noteWindow.onData((data) => {
      if (data && data.id === props.noteId) {
        Object.assign(note, data)
      }
    })
  }

  if (window.api?.notes) {
    try {
      const notes = await window.api.notes.list()
      const found = notes.find(n => n.id === props.noteId)
      if (found) {
        Object.assign(note, found)
      }
    } catch (err) { console.error('[NotePopout] load failed:', err) }
  }
})

onBeforeUnmount(() => {
  if (unsubNoteData) unsubNoteData()
})

function close() {
  window.close()
}

async function togglePin() {
  pinned.value = !pinned.value
  try {
    await window.api?.noteWindow?.setPinned(props.noteId, pinned.value)
  } catch (err) {
    console.error('[NotePopout] setPinned failed:', err)
    pinned.value = !pinned.value
  }
}

function setOpacity(value) {
  const v = Math.min(100, Math.max(30, Number(value)))
  opacity.value = v
  try {
    localStorage.setItem(OPACITY_KEY, String(v))
  } catch {}
}

function onEnterEnd(e) {
  // scoped 样式会给 keyframes 加 hash 后缀（popout-expand-xxxx），用 includes 匹配
  if (String(e.animationName).includes('popout-expand')) {
    e.currentTarget.classList.remove('popout-enter')
  }
}
</script>

<style scoped>
@keyframes popout-expand {
  0% {
    opacity: 0;
    transform: scale(0.95) translateY(-8px);
    border-radius: 20px;
  }
  40% {
    opacity: 1;
    transform: scale(0.98) translateY(2px);
    border-radius: 12px;
  }
  70% {
    transform: scale(1.01) translateY(-1px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
    border-radius: 10px;
  }
}

.note-popout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--apple-card);
  border-radius: var(--radius-panel);
  overflow: hidden;
  transform-origin: top center;
}

.note-popout.popout-enter {
  animation: popout-expand 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.popout-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--apple-accent);
  border-bottom: 1px solid var(--apple-border);
  -webkit-app-region: drag;
  cursor: grab;
}

.note-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--apple-primary);
}

.popout-header strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--apple-muted-foreground);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.head-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--apple-muted-foreground);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.head-btn.active {
  color: var(--apple-primary);
  background: var(--brand-soft);
}

@media (hover: hover) and (pointer: fine) {
  .close-btn:hover {
    background: var(--apple-secondary);
    color: var(--apple-foreground);
  }

  .head-btn:hover {
    background: var(--apple-secondary);
    color: var(--apple-foreground);
  }

  .head-btn.active:hover {
    background: var(--brand-soft);
    color: var(--apple-primary);
  }
}

/* 透明度调节条 */
.opacity-pop {
  position: absolute;
  top: 44px;
  right: 38px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-popover);
  box-shadow: var(--shadow-xl);
}

.opacity-pop-icon {
  flex: none;
  color: var(--apple-primary);
}

.opacity-pop input[type="range"] {
  width: 96px;
  accent-color: var(--apple-primary);
  cursor: pointer;
}

.opacity-pop-value {
  flex: none;
  min-width: 34px;
  font-size: 11px;
  font-weight: 600;
  color: var(--apple-foreground);
  text-align: right;
}

.popout-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.popout-preview {
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  display: block !important;
  max-height: unset !important;
  overflow: visible !important;
  margin: 0 !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--apple-foreground) !important;
}

.popout-preview :where(p, div, h1, h2, h3, h4, h5, h6,
                      ul, ol, li, blockquote, pre, dl, dt, dd,
                      table, thead, tbody, tr, th, td) {
  display: block !important;
  margin: 0.4em 0 !important;
}

.popout-preview h1 { font-size: 18px; font-weight: 700; }
.popout-preview h2 { font-size: 16px; font-weight: 700; }
.popout-preview h3 { font-size: 14px; font-weight: 700; }
.popout-preview ul { padding-left: 1.6em; }
.popout-preview ol { padding-left: 1.6em; }
.popout-preview blockquote { border-left: 3px solid var(--apple-primary); padding-left: 10px; margin-left: 0; }
.popout-preview pre { background: var(--brand-soft); padding: 8px; border-radius: 6px; }
.popout-preview code { background: var(--brand-soft); padding: 1px 5px; border-radius: 3px; font-family: var(--font-mono); font-size: 12px; }

.empty-hint {
  color: var(--apple-muted-foreground);
  font-size: 13px;
  text-align: center;
  margin-top: 40px;
}

.popout-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--apple-border);
  font-size: 11px;
  color: var(--apple-muted-foreground);
}

.category-pill {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--brand-soft);
  color: var(--apple-primary);
  font-size: 11px;
}

.color-red .popout-header { border-left: 3px solid var(--note-red); }
.color-orange .popout-header { border-left: 3px solid var(--note-orange); }
.color-yellow .popout-header { border-left: 3px solid var(--note-yellow); }
.color-green .popout-header { border-left: 3px solid var(--note-green); }
.color-blue .popout-header { border-left: 3px solid var(--note-blue); }
.color-purple .popout-header { border-left: 3px solid var(--note-purple); }
</style>
