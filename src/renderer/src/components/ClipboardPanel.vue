<template>
  <section class="clipboard-panel">
    <div v-if="!store.selectMode" style="display:flex;justify-content:space-between;padding:0 14px 4px;font-size:11px;color:var(--text-muted)">
      <span>{{ store.items.length }} 条记录</span>
      <div style="display:flex;gap:8px">
        <button class="text-btn" @click="store.enterSelectMode()">选择</button>
        <button v-if="store.items.length" class="text-btn danger" @click="handleClearAll">清空未固定</button>
      </div>
    </div>
    <div v-else class="select-toolbar">
      <span>已选 {{ store.selectedIds.size }} 项</span>
      <button @click="store.selectAll()">全选</button>
      <button @click="store.exitSelectMode()">取消</button>
      <button class="danger" @click="handleDeleteSelected">删除所选</button>
    </div>

    <div class="clip-list" v-if="store.filteredItems.length">
      <div v-for="item in store.filteredItems" :key="item.id" class="clip-card" :class="{ pinned: item.pinned }"
        @click="onClick(item)" @dblclick="showDetail = true; detailItem = item"
        @contextmenu.prevent="onContextMenu(item)">
        <span v-if="store.selectMode" class="select-check" :class="{ checked: store.selectedIds.has(item.id) }" @click.stop="store.toggleSelect(item.id)">{{ store.selectedIds.has(item.id) ? '✓' : '' }}</span>
        <div style="flex:1;min-width:0">
          <div class="clip-top"><span class="type-tag">{{ item.type }}</span><time>{{ relativeTime(item.last_copied_at) }}</time></div>
          <div class="clip-preview">{{ item.preview || item.content || '(空)' }}</div>
        </div>
        <div class="clip-actions" v-if="!store.selectMode">
          <button class="mini-btn" @click.stop="store.togglePin(item.id)"><Pin :size="13" :class="{ active: item.pinned }" /></button>
          <button class="mini-btn" @click.stop="store.deleteItem(item.id)"><Trash2 :size="13" /></button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <StickyNote :size="30" />
      <p>暂无剪切板历史</p>
      <p class="hint">复制任意文字，这里会自动记录</p>
    </div>

    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-panel">
        <div class="detail-header"><h3>详情</h3><button class="mini-btn" @click="showDetail = false"><X :size="14" /></button></div>
        <textarea readonly class="detail-textarea">{{ detailItem?.content || '' }}</textarea>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Pin, Trash2, X, StickyNote } from 'lucide-vue-next'
import { useClipboardStore } from '../stores/clipboard'

const store = useClipboardStore()
const showDetail = ref(false)
const detailItem = ref(null)

let unsubscribe = null
onMounted(async () => {
  await store.load()
  unsubscribe = window.api?.clipboard?.onNewItem((item) => store.addItem(item))
})
onUnmounted(() => { if (unsubscribe) unsubscribe() })

function onClick(item) {
  if (store.selectMode) { store.toggleSelect(item.id); return }
  store.paste(item.id)
}
function onContextMenu(item) {
  // handled by main process context menu
}
async function handleClearAll() {
  if (confirm('确定清空所有未固定的剪切板记录？')) await store.clearAll()
}
async function handleDeleteSelected() {
  if (store.selectedIds.size && confirm(`确定删除已选的 ${store.selectedIds.size} 条？`)) await store.deleteSelected()
}
function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.clipboard-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.text-btn { background: none; border: none; font-size: 11px; cursor: pointer; color: var(--text-muted); font-family: inherit; }
.text-btn:hover { color: var(--text); }
.text-btn.danger { color: var(--danger); }
.select-toolbar { display: flex; align-items: center; gap: 6px; padding: 0 14px 4px; font-size: 11px; color: var(--text-muted); }
.select-toolbar button { padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-input); color: var(--text-muted); font-size: 10px; cursor: pointer; font-family: inherit; }
.select-toolbar button:hover { border-color: var(--accent); color: var(--accent); }
.select-toolbar button.danger { color: var(--danger); border-color: var(--danger); }
.select-check { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--text-muted); flex-shrink: 0; display: grid; place-items: center; font-size: 10px; cursor: pointer; margin-right: 6px; }
.select-check.checked { background: var(--accent); border-color: var(--accent); color: #fff; }
.clip-list { flex: 1; overflow-y: auto; padding: 0 12px; display: flex; flex-direction: column; gap: 6px; }
.clip-card { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); cursor: pointer; transition: border-color 0.15s; }
.clip-card:hover { border-color: var(--accent); }
.clip-card.pinned { border-left: 3px solid var(--accent); }
.clip-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
.type-tag { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.clip-top time { font-size: 10px; color: var(--text-muted); }
.clip-preview { font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clip-actions { display: flex; gap: 2px; flex-shrink: 0; }
.mini-btn { width: 24px; height: 24px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; }
.mini-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.mini-btn .active { color: var(--accent); }
.empty-state { display: grid; place-items: center; align-content: center; min-height: 160px; color: var(--text-muted); font-size: 13px; gap: 4px; }
.empty-state .hint { font-size: 11px; opacity: 0.7; }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--bg-overlay); display: grid; place-items: center; padding: 12px; }
.detail-panel { width: 100%; max-height: 80vh; padding: 14px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--border); box-shadow: var(--shadow); }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.detail-header h3 { font-size: 15px; font-weight: 600; color: var(--text); }
.detail-textarea { width: 100%; min-height: 160px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12px; padding: 10px; resize: vertical; font-family: inherit; outline: 0; white-space: pre-wrap; word-break: break-all; }
</style>
