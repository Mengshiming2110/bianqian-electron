<template>
  <div class="note-popout popout-enter" :class="['color-' + note.color]" @animationend="onEnterEnd">
    <header class="popout-header" @mousedown.start="startDrag">
      <strong>{{ note.title }}</strong>
      <button class="close-btn" title="关闭" type="button" @click="close">
        <X :size="14" />
      </button>
    </header>
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
import { reactive, onMounted, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'
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

function onEnterEnd(e) {
  if (e.animationName === 'popout-expand') {
    e.currentTarget.classList.remove('popout-enter')
  }
}
</script>

<style scoped>
@keyframes popout-expand {
  0% {
    opacity: 0;
    transform: scale(0.4) translateY(-12px);
    border-radius: 20px;
  }
  40% {
    opacity: 1;
    transform: scale(0.92) translateY(2px);
    border-radius: 12px;
  }
  70% {
    transform: scale(1.02) translateY(-1px);
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
  background: var(--bg-elevated, #fff);
  border-radius: var(--radius-panel);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  transform-origin: top center;
}

.note-popout.popout-enter {
  animation: popout-expand 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.popout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  -webkit-app-region: drag;
  cursor: grab;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
}

.popout-header strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--text, #1a2e2b);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #7a8e8a);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.close-btn:hover { background: var(--accent-soft, rgba(47,125,120,0.08)); }

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
  color: var(--text, #1a2e2b) !important;
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
.popout-preview blockquote { border-left: 3px solid var(--accent, #2f7d78); padding-left: 10px; margin-left: 0; }
.popout-preview pre { background: var(--accent-soft, rgba(47,125,120,0.08)); padding: 8px; border-radius: 6px; }
.popout-preview code { background: var(--accent-soft, rgba(47,125,120,0.08)); padding: 1px 5px; border-radius: 3px; font-family: Consolas, Monaco, monospace; font-size: 12px; }

.empty-hint {
  color: var(--text-muted, #7a8e8a);
  font-size: 13px;
  text-align: center;
  margin-top: 40px;
}

.popout-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--border, rgba(0,0,0,0.08));
  font-size: 11px;
  color: var(--text-muted, #7a8e8a);
}

.category-pill {
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--accent-soft, rgba(47,125,120,0.08));
  color: var(--accent, #2f7d78);
  font-size: 11px;
}

.color-red .popout-header { border-left: 3px solid #ef4444; }
.color-orange .popout-header { border-left: 3px solid #f97316; }
.color-yellow .popout-header { border-left: 3px solid #eab308; }
.color-green .popout-header { border-left: 3px solid #22c55e; }
.color-blue .popout-header { border-left: 3px solid #3b82f6; }
.color-purple .popout-header { border-left: 3px solid #a855f7; }
</style>
