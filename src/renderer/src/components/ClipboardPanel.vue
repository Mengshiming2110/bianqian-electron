<template>
  <section class="clipboard-panel">
    <!-- 选择模式工具栏 -->
    <div v-if="store.selectMode" class="select-toolbar">
      <span>已选 {{ store.selectedIds.size }} 项</span>
      <div class="select-toolbar-actions">
        <button class="text-btn" type="button" @click="store.selectAll()">全选</button>
        <button class="text-btn" type="button" @click="store.exitSelectMode()">取消</button>
        <button class="text-btn danger" type="button" @click="handleDeleteSelected">删除所选</button>
      </div>
    </div>

    <!-- 普通模式：搜索 + 选择入口 -->
    <div v-else class="panel-toolbar">
      <label class="search-field">
        <Search :size="16" class="search-icon" aria-hidden="true" />
        <input
          class="search-input"
          type="text"
          :value="store.searchQuery"
          placeholder="搜索剪切板内容"
          @input="store.search($event.target.value)"
        />
      </label>
      <button class="text-btn" type="button" @click="store.enterSelectMode()">选择</button>
    </div>

    <template v-if="store.filteredItems.length">
      <!-- 固定 -->
      <section v-if="pinnedItems.length" class="clip-section" aria-label="固定内容">
        <div class="section-head">
          <h2 class="section-title">固定</h2>
          <span class="section-count">{{ pinnedItems.length }}</span>
        </div>
        <div class="clip-grid">
          <article
            v-for="item in pinnedItems"
            :key="item.id"
            class="clip-card"
            @click="onClick(item)"
            @dblclick="openDetail(item)"
            @contextmenu.prevent
          >
            <span
              v-if="store.selectMode"
              class="select-check"
              :class="{ checked: store.selectedIds.has(item.id) }"
              @click.stop="store.toggleSelect(item.id)"
            ><Check v-if="store.selectedIds.has(item.id)" :size="10" /></span>
            <div class="thumb">
              <File v-if="item.type === 'file'" :size="16" class="thumb-icon" />
              <ExternalLink v-else-if="item.type === 'link'" :size="16" class="thumb-icon" />
              <Image v-else-if="item.type === 'image'" :size="16" class="thumb-icon" />
              <span v-else class="thumb-letter">{{ firstChar(item) }}</span>
            </div>
            <div class="clip-main">
              <p class="clip-title">{{ item.preview || item.content || '(空)' }}</p>
              <p class="clip-meta">{{ typeLabel(item) }} · {{ relativeTime(item.last_copied_at) }}</p>
            </div>
            <div v-if="!store.selectMode" class="clip-actions">
              <button class="icon-btn is-active" :title="item.pinned ? '取消固定' : '固定'" type="button" @click.stop="store.togglePin(item.id)">
                <Pin :size="16" />
              </button>
              <button class="icon-btn is-danger" title="删除" type="button" @click.stop="handleDelete(item)">
                <Trash2 :size="16" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- 最近 -->
      <section v-if="recentItems.length" class="clip-section" aria-label="最近内容">
        <div class="section-head">
          <h2 class="section-title">最近</h2>
          <span class="section-count">{{ recentItems.length }}</span>
        </div>
        <div class="list-group">
          <div
            v-for="item in recentItems"
            :key="item.id"
            class="list-row"
            @click="onClick(item)"
            @dblclick="openDetail(item)"
            @contextmenu.prevent
          >
            <span
              v-if="store.selectMode"
              class="select-check"
              :class="{ checked: store.selectedIds.has(item.id) }"
              @click.stop="store.toggleSelect(item.id)"
            ><Check v-if="store.selectedIds.has(item.id)" :size="10" /></span>
            <div class="thumb">
              <File v-if="item.type === 'file'" :size="16" class="thumb-icon" />
              <ExternalLink v-else-if="item.type === 'link'" :size="16" class="thumb-icon" />
              <Image v-else-if="item.type === 'image'" :size="16" class="thumb-icon" />
              <span v-else class="thumb-letter">{{ firstChar(item) }}</span>
            </div>
            <div class="clip-main">
              <p class="clip-title">{{ item.preview || item.content || '(空)' }}</p>
              <p class="clip-meta">{{ typeLabel(item) }} · {{ relativeTime(item.last_copied_at) }}</p>
            </div>
            <div v-if="!store.selectMode" class="row-actions">
              <button class="icon-btn" title="复制" type="button" @click.stop="store.paste(item.id)">
                <Copy :size="16" />
              </button>
              <button class="icon-btn" :class="{ 'is-active': item.pinned }" :title="item.pinned ? '取消固定' : '固定'" type="button" @click.stop="store.togglePin(item.id)">
                <Pin :size="16" />
              </button>
              <button class="icon-btn is-danger" title="删除" type="button" @click.stop="handleDelete(item)">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- 空态 -->
    <div v-else class="empty-state">
      <span class="empty-icon"><ClipboardList :size="28" /></span>
      <p class="empty-title">还没有剪切板记录</p>
      <p class="empty-hint">复制文字或图片后会出现在这里</p>
      <div class="empty-tip"><Keyboard :size="12" />按 Ctrl+C 复制任意内容，即可在此快速找回</div>
    </div>

    <!-- 详情弹层 -->
    <div v-if="showDetail" class="overlay-backdrop blur" @click.self="showDetail = false">
      <div class="detail-panel">
        <header class="detail-header">
          <h3>详情</h3>
          <button class="icon-btn" title="关闭" type="button" @click="showDetail = false"><X :size="18" /></button>
        </header>
        <textarea readonly class="detail-textarea">{{ detailItem?.content || '' }}</textarea>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Check, ClipboardList, Copy, ExternalLink, File, Image, Keyboard, Pin, Search, Trash2, X } from 'lucide-vue-next'
import { useClipboardStore } from '../stores/clipboard'
import { relativeTime } from '../lib/format'

const store = useClipboardStore()
const showDetail = ref(false)
const detailItem = ref(null)

const pinnedItems = computed(() => store.filteredItems.filter((item) => item.pinned))
const recentItems = computed(() => store.filteredItems.filter((item) => !item.pinned))

let unsubscribe = null
let mounted = true
onMounted(async () => {
  unsubscribe = window.api?.clipboard?.onNewItem((item) => { if (mounted) store.addItem(item) })
  try { await store.load() } catch (err) { console.error('[ClipboardPanel] load failed:', err) }
})
onBeforeUnmount(() => {
  mounted = false
  if (unsubscribe) unsubscribe()
})

function onClick(item) {
  if (store.selectMode) { store.toggleSelect(item.id); return }
  store.paste(item.id)
}
function openDetail(item) {
  detailItem.value = item
  showDetail.value = true
}
async function handleDelete(item) {
  try { await store.deleteItem(item.id) } catch (err) { console.error('[ClipboardPanel] delete failed:', err) }
}
async function handleDeleteSelected() {
  if (store.selectedIds.size && confirm(`确定删除已选的 ${store.selectedIds.size} 条？`)) await store.deleteSelected()
}
function firstChar(item) {
  return (item.preview || item.content || '剪').trim().charAt(0) || '剪'
}
function typeLabel(item) {
  const map = { text: '文本', link: '链接', file: '文件', image: '图片' }
  return map[item.type] || item.type || '文本'
}
</script>

<style scoped>
.clipboard-panel {
  min-width: 0;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 18px;
}

.panel-toolbar .search-field {
  flex: 1;
  margin: 0;
}

.text-btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 2px;
  font-size: 12px;
  color: var(--apple-muted-foreground);
  cursor: pointer;
  transition: color 0.15s var(--ease-out);
  flex: none;
}

.select-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  margin: 2px 0 18px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--apple-muted-foreground);
}

.select-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.select-check {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--apple-muted-foreground);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 10px;
  cursor: pointer;
}

.select-check.checked {
  background: var(--apple-primary);
  border-color: var(--apple-primary);
  color: var(--apple-primary-foreground);
}

.detail-panel {
  width: 100%;
  max-height: 80vh;
  padding: 14px;
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  box-shadow: var(--shadow-xl);
  animation: rise var(--dur-base) var(--ease-spring);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.detail-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.detail-textarea {
  width: 100%;
  min-height: 160px;
  background: var(--apple-background);
  border: 1px solid var(--apple-border);
  border-radius: 10px;
  color: var(--apple-foreground);
  font-size: 12px;
  padding: 10px;
  resize: vertical;
  outline: 0;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

@media (hover: hover) and (pointer: fine) {
  .text-btn:hover {
    color: var(--apple-foreground);
  }

  .text-btn.danger:hover {
    color: var(--apple-destructive);
  }
}
</style>
