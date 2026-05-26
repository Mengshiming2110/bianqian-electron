<template>
  <p v-if="isMini" class="note-preview">{{ content }}</p>
  <div
    v-else-if="renderedHtml"
    class="note-preview markdown-preview"
    @click="onClick"
    v-html="renderedHtml"
  />
  <p v-else class="note-preview">{{ content }}</p>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({
  content: { type: String, default: '' },
  isMini: { type: Boolean, default: false }
})

const emit = defineEmits(['link-click'])

const renderedHtml = computed(() => {
  const text = (props.content || '').trim()
  if (!text || props.isMini) return ''

  const raw = marked.parse(text, { async: false })
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
      'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
    ALLOW_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'checked', 'type']
  })
})

function onClick(event) {
  const link = event.target.closest('a')
  if (link) {
    event.preventDefault()
    event.stopPropagation()
    emit('link-click', link.href)
  }
}
</script>

<style scoped>
.markdown-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  max-height: calc(2 * 17px);
  overflow: hidden;
  margin: 6px 0 8px 29px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 17px;
  word-break: break-word;
}

.markdown-preview :where(p, div, h1, h2, h3, h4, h5, h6,
                          ul, ol, li, blockquote, pre, dl, dt, dd,
                          table, thead, tbody, tr, th, td) {
  display: inline;
  margin: 0;
  padding: 0;
}

.markdown-preview br { display: none; }

.markdown-preview :where(h1, h2, h3, h4, h5, h6)::before {
  content: "#";
  color: var(--accent);
  margin-right: 1px;
}

.markdown-preview ul > li::before {
  content: "• ";
}

.markdown-preview ol { counter-reset: md-li; }
.markdown-preview ol > li::before {
  content: counter(md-li) ". ";
  counter-increment: md-li;
}

.markdown-preview blockquote::before {
  content: "| ";
  color: var(--accent-strong);
}

.markdown-preview code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--accent-soft);
  font-size: 11px;
  font-family: Consolas, Monaco, monospace;
}

.markdown-preview a {
  color: var(--accent);
  text-decoration: none;
}

.markdown-preview del,
.markdown-preview s {
  text-decoration: line-through;
}

.markdown-preview strong,
.markdown-preview b {
  font-weight: 700;
}

.markdown-preview em,
.markdown-preview i {
  font-style: italic;
}
</style>
