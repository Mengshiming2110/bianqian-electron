<template>
  <div class="clipboard-panel" style="display:flex;flex-direction:column;gap:6px;min-height:0">
    <!-- 统计栏 -->
    <div class="stats-bar" style="padding:0 2px 2px" v-if="!store.selectMode">
      <span>{{ store.items.length }} 条记录</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="clear-btn" @click="enterSelect">选择</button>
        <button class="clear-btn" @click="handleClearAll" v-if="store.items.length">清空未固定</button>
      </div>
    </div>

    <!-- 多选工具栏 -->
    <div class="select-toolbar" v-if="store.selectMode">
      <span>已选 {{ store.selectedIds.size }} 项</span>
      <button @click="store.selectAll()">全选</button>
      <button @click="store.exitSelectMode()">取消</button>
      <button class="danger" @click="handleDeleteSelected">删除所选</button>
    </div>

    <!-- 卡片列表 -->
    <div ref="listRef" style="overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:4px">
      <div
        v-for="item in store.filteredItems"
        :key="item.id"
        :data-id="item.id"
        class="card-wrap"
        :class="{ pinned: item.pinned }"
        @click="onCardClick(item)"
        @dblclick="onCardDblClick(item)"
        @contextmenu.prevent="onContextMenu(item, $event)"
      >
        <div class="card" style="display:flex;gap:8px">
          <span
            v-if="store.selectMode"
            class="select-check"
            :class="{ checked: store.selectedIds.has(item.id) }"
            @click.stop="store.toggleSelect(item.id)"
          >{{ store.selectedIds.has(item.id) ? '✓' : '' }}</span>
          <div style="flex:1;min-width:0">
            <div class="clip-top">
              <span class="type-badge">{{ item.type }}</span>
              <time>{{ relativeTime(item.last_copied_at) }}</time>
            </div>
            <div class="clip-preview" v-if="item.type === 'image'" style="display:flex;align-items:center;gap:6px">
              <svg style="width:14px;height:14px"><use href="#ic-picture"/></svg>
              <span style="font-size:10px;color:var(--text-tertiary)">图片</span>
            </div>
            <div class="clip-preview" v-else>{{ item.preview || item.content || '(空)' }}</div>
          </div>
          <div class="clip-actions" v-if="!store.selectMode" style="flex-shrink:0;flex-direction:column;gap:2px">
            <button class="mini-btn" :title="item.pinned ? '取消固定' : '固定'" @click.stop="store.togglePin(item.id)">
              <svg><use href="#ic-pin"/></svg>
            </button>
            <button class="mini-btn" title="删除" @click.stop="store.deleteItem(item.id)">
              <svg><use href="#ic-trash"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!store.items.length" class="empty-state" style="min-height:200px;display:grid;place-items:center;color:var(--text-tertiary);font-size:12px;text-align:center">
      <svg style="width:32px;height:32px;opacity:0.5;margin-bottom:8px"><use href="#ic-clipboard"/></svg>
      <p>暂无剪切板历史</p>
      <p style="font-size:10px;opacity:0.7;margin-top:4px">复制任意文字，这里会自动记录</p>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-panel">
        <div class="detail-header">
          <h3>{{ detailType }}</h3>
          <button class="mini-btn" @click="showDetail = false"><svg style="width:14px;height:14px"><use href="#ic-x"/></svg></button>
        </div>
        <div class="detail-meta">
          <span>{{ relativeTime(detailItem?.last_copied_at) }}</span>
          <span>复制 {{ detailItem?.copy_count || 1 }} 次</span>
        </div>
        <textarea readonly style="width:100%;min-height:200px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-control);color:var(--text);font-size:12px;padding:10px;resize:vertical;font-family:inherit;outline:0;white-space:pre-wrap;word-break:break-all">{{ detailItem?.content || '' }}</textarea>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useClipboardStore } from '../stores/clipboard'

const store = useClipboardStore()
const showDetail = ref(false)
const detailItem = ref(null)
const detailType = ref('')
const listRef = ref(null)

let pasteFlashTimer = null
let unsubscribeNewItem = null

onMounted(async () => {
  await store.load()
  unsubscribeNewItem = window.api.clipboard?.onNewItem((item) => {
    store.addItem(item)
  })
})

onUnmounted(() => {
  if (unsubscribeNewItem) unsubscribeNewItem()
  if (pasteFlashTimer) clearTimeout(pasteFlashTimer)
})

function onCardClick(item) {
  if (store.selectMode) {
    store.toggleSelect(item.id)
    return
  }
  store.paste(item.id)
  flashCard(item.id)
}

function flashCard(id) {
  if (!listRef.value) return
  const wrap = listRef.value.querySelector(`[data-id="${id}"]`)
  if (wrap) {
    wrap.classList.add('paste-flash')
    clearTimeout(pasteFlashTimer)
    pasteFlashTimer = setTimeout(() => {
      wrap.classList.remove('paste-flash')
    }, 300)
  }
}

function onCardDblClick(item) {
  if (store.selectMode) return
  detailItem.value = item
  detailType.value = item.type?.toUpperCase() || '详情'
  showDetail.value = true
}

async function onContextMenu(item, event) {
  // Context menu is handled by the main process via IPC
  // This will be implemented in Task 20 (App.vue integration)
}

async function handleClearAll() {
  if (confirm('确定清空所有未固定的剪切板记录？')) {
    await store.clearAll()
  }
}

function enterSelect() {
  store.enterSelectMode()
}

async function handleDeleteSelected() {
  if (store.selectedIds.size === 0) return
  if (confirm(`确定删除已选的 ${store.selectedIds.size} 条记录？`)) {
    await store.deleteSelected()
  }
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  const d = new Date(iso)
  if (diff < 172800000) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>
