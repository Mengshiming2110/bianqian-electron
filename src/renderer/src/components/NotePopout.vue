<template>
  <div class="note-popout popout-enter" :class="note.color ? 'color-' + note.color : ''" @animationend="onEnterEnd">
    <header class="popout-header">
      <span class="note-dot" aria-hidden="true"></span>
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

@media (hover: hover) and (pointer: fine) {
  .close-btn:hover {
    background: var(--apple-secondary);
    color: var(--apple-foreground);
  }
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
