<template>
  <div class="time-picker">
    <button
      ref="triggerRef"
      type="button"
      class="picker-trigger"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="handleToggle"
    >
      <span class="picker-value" :class="{ placeholder: !modelValue }">{{ modelValue || '选择时间' }}</span>
      <ChevronDown :size="14" class="picker-chevron" :class="{ open }" />
    </button>

    <transition name="drop">
      <div v-if="open" ref="popElRef" class="picker-popover" role="dialog" :style="popStyle">
        <div class="wheel">
          <div ref="hourCol" class="wheel-col">
            <button
              v-for="h in hours"
              :key="h"
              type="button"
              class="wheel-item"
              :class="{ selected: h === hourValue }"
              @click="chooseHour(h)"
            >{{ h }}</button>
          </div>
          <span class="wheel-sep">:</span>
          <div ref="minuteCol" class="wheel-col">
            <button
              v-for="m in minutes"
              :key="m"
              type="button"
              class="wheel-item"
              :class="{ selected: m === minuteValue }"
              @click="chooseMinute(m)"
            >{{ m }}</button>
          </div>
        </div>

        <footer class="time-actions">
          <button type="button" class="time-link" @click="chooseNow">现在</button>
          <button type="button" class="time-link muted" @click="clear">清除</button>
        </footer>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { usePopover } from '../lib/use-popover'

const props = defineProps({
  modelValue: { type: String, default: '' } // 'HH:MM'
})
const emit = defineEmits(['update:modelValue', 'change'])

const triggerRef = ref(null)
const popElRef = ref(null)
const hourCol = ref(null)
const minuteCol = ref(null)
const { open, popStyle, toggle, setPopEl } = usePopover({ width: 232 })
watch(popElRef, (el) => setPopEl(el))

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const hourValue = computed(() => {
  const h = String(props.modelValue || '').split(':')[0]
  return h && hours.includes(h) ? h : ''
})
const minuteValue = computed(() => {
  const m = String(props.modelValue || '').split(':')[1]
  return m && minutes.includes(m) ? m : ''
})

function fmtDate(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function handleToggle() {
  if (!open.value) {
    nextTick(() => {
      const now = new Date()
      const targetHour = hourValue.value || fmtDate(now).split(':')[0]
      const targetMinute = minuteValue.value || fmtDate(now).split(':')[1]
      hourCol.value?.querySelector(`.wheel-item:nth-child(${Number(targetHour) + 1})`)
        ?.scrollIntoView({ block: 'center' })
      minuteCol.value?.querySelector(`.wheel-item:nth-child(${Number(targetMinute) + 1})`)
        ?.scrollIntoView({ block: 'center' })
    })
  }
  toggle(triggerRef.value)
}

function chooseHour(h) {
  const value = `${h}:${minuteValue.value || '00'}`
  if (value === props.modelValue) {
    toggle(triggerRef.value) // 已选中，确认关闭
    return
  }
  emit('update:modelValue', value)
  emit('change', value)
  // 保持打开，等待选择分钟
}

function chooseMinute(m) {
  const value = `${hourValue.value || '00'}:${m}`
  if (value === props.modelValue) {
    toggle(triggerRef.value) // 已选中，确认关闭
    return
  }
  emit('update:modelValue', value)
  emit('change', value)
  toggle(triggerRef.value) // 分钟选定即完成
}

function chooseNow() {
  const value = fmtDate(new Date())
  emit('update:modelValue', value)
  emit('change', value)
  toggle(triggerRef.value)
}

function clear() {
  emit('update:modelValue', '')
  emit('change', '')
  toggle(triggerRef.value)
}
</script>

<style scoped>
.time-picker {
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

/* ===== 时间滚轮弹层 ===== */
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

.wheel {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
}

.wheel-col {
  position: relative;
  width: 76px;
  height: 170px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-snap-type: y proximity;
  scrollbar-width: none;
}

.wheel-col::-webkit-scrollbar {
  display: none;
}

/* 中心选中带 */
.wheel-col::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 34px;
  transform: translateY(-50%);
  background: color-mix(in srgb, var(--apple-ring) 9%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--apple-ring) 22%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--apple-ring) 22%, transparent);
  border-radius: var(--radius-sm);
  pointer-events: none;
}

.wheel-item {
  display: grid;
  place-items: center;
  width: 100%;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--apple-muted-foreground);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  scroll-snap-align: center;
  transition: color 0.12s var(--ease-out);
}

.wheel-item.selected {
  color: var(--apple-primary);
  font-weight: 700;
}

.wheel-item:focus-visible {
  outline: 2px solid var(--apple-ring);
  outline-offset: -2px;
}

.wheel-sep {
  align-self: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--apple-muted-foreground);
}

.time-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px 2px;
  border-top: 1px solid var(--apple-border);
  margin-top: 8px;
}

.time-link {
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

.time-link.muted {
  color: var(--apple-muted-foreground);
  font-weight: 500;
}

.time-link:focus-visible {
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
  .wheel-item:not(.selected):hover {
    color: var(--apple-foreground);
  }

  .time-link:hover {
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
