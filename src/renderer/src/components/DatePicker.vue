<template>
  <div class="date-picker">
    <button
      ref="triggerRef"
      type="button"
      class="picker-trigger"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="handleToggle"
    >
      <span class="picker-value" :class="{ placeholder: !modelValue }">{{ modelValue || '选择日期' }}</span>
      <ChevronDown :size="14" class="picker-chevron" :class="{ open }" />
    </button>

    <transition name="drop">
      <div v-if="open" ref="popElRef" class="picker-popover" role="dialog" :style="popStyle">
        <header class="cal-head">
          <button type="button" class="cal-nav" aria-label="上个月" @click="shiftMonth(-1)">
            <ChevronLeft :size="15" />
          </button>
          <strong class="cal-title">{{ viewYear }}年{{ viewMonth + 1 }}月</strong>
          <button type="button" class="cal-nav" aria-label="下个月" @click="shiftMonth(1)">
            <ChevronRight :size="15" />
          </button>
        </header>

        <div class="cal-week">
          <span v-for="w in weekdayLabels" :key="w">{{ w }}</span>
        </div>

        <div class="cal-grid" role="grid">
          <button
            v-for="cell in calendar"
            :key="cell.date.getTime()"
            type="button"
            class="cal-cell"
            :class="{
              out: !cell.inMonth,
              today: cell.isToday && !cell.isSelected,
              selected: cell.isSelected
            }"
            role="gridcell"
            @click="choose(cell)"
          >{{ cell.day }}</button>
        </div>

        <footer class="cal-actions">
          <button type="button" class="cal-link" @click="chooseToday">今天</button>
          <button type="button" class="cal-link muted" @click="clear">清除</button>
        </footer>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { usePopover } from '../lib/use-popover'

const props = defineProps({
  modelValue: { type: String, default: '' } // 'YYYY-MM-DD'
})
const emit = defineEmits(['update:modelValue', 'change'])

const triggerRef = ref(null)
const popElRef = ref(null)
const { open, popStyle, toggle, setPopEl } = usePopover({ width: 252 })
watch(popElRef, (el) => setPopEl(el))
const viewYear = ref(0)
const viewMonth = ref(0)

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parse(value) {
  if (!value) return null
  const [y, m, d] = String(value).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

const calendar = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startOffset = (first.getDay() + 6) % 7 // 周一 = 0
  const start = new Date(viewYear.value, viewMonth.value, 1 - startOffset)
  const today = new Date()
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      date: d,
      day: d.getDate(),
      inMonth: d.getMonth() === viewMonth.value,
      isToday: d.toDateString() === today.toDateString(),
      isSelected: props.modelValue === fmt(d)
    })
  }
  return cells
})

function handleToggle() {
  if (!open.value) {
    const base = parse(props.modelValue) || new Date()
    viewYear.value = base.getFullYear()
    viewMonth.value = base.getMonth()
  }
  toggle(triggerRef.value)
}

function shiftMonth(delta) {
  const base = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = base.getFullYear()
  viewMonth.value = base.getMonth()
}

function choose(cell) {
  emit('update:modelValue', fmt(cell.date))
  emit('change', fmt(cell.date))
  toggle(triggerRef.value)
}

function chooseToday() {
  const today = new Date()
  emit('update:modelValue', fmt(today))
  emit('change', fmt(today))
  toggle(triggerRef.value)
}

function clear() {
  emit('update:modelValue', '')
  emit('change', '')
  toggle(triggerRef.value)
}
</script>

<style scoped>
.date-picker {
  position: relative;
  min-width: 0;
}

.picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--apple-muted);
  color: var(--apple-foreground);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  transition:
    background-color 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out);
}

.picker-trigger:focus-visible {
  background: var(--apple-background);
  box-shadow: 0 0 0 1px var(--apple-ring);
  outline: 0;
}

.picker-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-value.placeholder {
  color: var(--apple-muted-foreground);
}

.picker-chevron {
  flex: none;
  color: var(--apple-muted-foreground);
  transition: transform 0.15s var(--ease-out);
}

.picker-chevron.open {
  transform: rotate(180deg);
}

/* ===== 日历弹层 ===== */
.picker-popover {
  position: fixed;
  z-index: 1200;
  padding: 10px 10px 6px;
  background: var(--apple-popover);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  box-shadow: var(--shadow-xl);
  transform-origin: var(--origin);
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 8px;
}

.cal-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.cal-nav {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--apple-primary);
  cursor: pointer;
  transition: background-color 0.12s var(--ease-out);
}

.cal-nav:focus-visible {
  outline: 2px solid var(--apple-ring);
  outline-offset: 1px;
}

.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  padding-bottom: 4px;
}

.cal-week span {
  display: grid;
  place-items: center;
  height: 20px;
  font-size: 10px;
  color: var(--apple-muted-foreground);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.cal-cell {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: 0 auto;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--apple-foreground);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.12s var(--ease-out), color 0.12s var(--ease-out);
}

.cal-cell.out {
  color: var(--apple-muted-foreground);
  opacity: 0.45;
}

.cal-cell.today {
  color: var(--apple-primary);
  font-weight: 700;
}

.cal-cell.selected {
  background: var(--apple-primary);
  color: #fff;
  font-weight: 600;
}

.cal-cell:focus-visible {
  outline: 2px solid var(--apple-ring);
  outline-offset: 1px;
}

.cal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px 2px;
  border-top: 1px solid var(--apple-border);
  margin-top: 8px;
}

.cal-link {
  border: 0;
  background: transparent;
  color: var(--apple-primary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  transition: background-color 0.12s var(--ease-out);
}

.cal-link.muted {
  color: var(--apple-muted-foreground);
  font-weight: 500;
}

.cal-link:focus-visible {
  outline: 2px solid var(--apple-ring);
  outline-offset: 1px;
}

/* 入场 150ms ease-out，从触发锚点缩放入场 */
.drop-enter-active,
.drop-leave-active {
  transition:
    opacity 0.15s var(--ease-out),
    transform 0.15s var(--ease-out);
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

@media (hover: hover) and (pointer: fine) {
  .cal-nav:hover {
    background: var(--apple-accent);
  }

  .cal-cell:not(.selected):hover {
    background: var(--apple-accent);
  }

  .cal-link:hover {
    background: var(--apple-accent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop-enter-active,
  .drop-leave-active {
    transition: opacity 0.1s linear;
  }

  .drop-enter-from,
  .drop-leave-to {
    transform: none;
  }
}
</style>
