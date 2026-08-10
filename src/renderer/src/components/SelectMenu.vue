<template>
  <div class="select-menu">
    <button
      ref="triggerRef"
      type="button"
      class="select-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle(triggerRef)"
    >
      <span class="select-value" :class="{ placeholder: !selected }">{{ selected ? selected.label : placeholder }}</span>
      <ChevronDown :size="14" class="select-chevron" :class="{ open }" />
    </button>

    <transition name="drop">
      <div v-if="open" ref="popElRef" class="select-popover" role="listbox" :style="popStyle">
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="select-item"
          :class="{ selected: opt.value === modelValue }"
          role="option"
          :aria-selected="opt.value === modelValue"
          @click="choose(opt)"
        >
          <span>{{ opt.label }}</span>
          <Check :size="14" class="select-check" v-if="opt.value === modelValue" />
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'
import { usePopover } from '../lib/use-popover'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] }, // [{ value, label }]
  placeholder: { type: String, default: '请选择' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const triggerRef = ref(null)
const popElRef = ref(null)
const { open, popStyle, toggle, setPopEl } = usePopover()
watch(popElRef, (el) => setPopEl(el))

const selected = computed(() => props.options.find((opt) => opt.value === props.modelValue) || null)

function choose(opt) {
  if (opt.value !== props.modelValue) {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
  }
  toggle(triggerRef.value)
}
</script>

<style scoped>
.select-menu {
  position: relative;
  min-width: 0;
}

.select-trigger {
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

.select-trigger:focus-visible {
  background: var(--apple-background);
  box-shadow: 0 0 0 1px var(--apple-ring);
  outline: 0;
}

.select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-value.placeholder {
  color: var(--apple-muted-foreground);
}

.select-chevron {
  flex: none;
  color: var(--apple-muted-foreground);
  transition: transform 0.15s var(--ease-out);
}

.select-chevron.open {
  transform: rotate(180deg);
}

.select-popover {
  position: fixed;
  z-index: 1200;
  padding: 4px;
  background: var(--apple-popover);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  box-shadow: var(--shadow-xl);
  transform-origin: var(--origin);
}

.select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--apple-radius-sm);
  background: transparent;
  color: var(--apple-foreground);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  transition: background-color 0.12s var(--ease-out), color 0.12s var(--ease-out);
}

.select-item.selected {
  color: var(--apple-primary);
  font-weight: 600;
}

.select-item:focus-visible {
  outline: 2px solid var(--apple-ring);
  outline-offset: -2px;
}

.select-check {
  flex: none;
  color: var(--apple-primary);
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
  .select-item:not(.selected):hover {
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
