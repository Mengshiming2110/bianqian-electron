<template>
  <div v-if="visible" class="about-overlay" @click.self="visible = false">
    <div class="about-card">
      <button class="card-close" type="button" title="关闭" aria-label="关闭弹层" @click="visible = false">
        <X :size="16" />
      </button>
      <div class="brand-badge"><StickyNote :size="24" /></div>
      <h2 class="about-title">领益工作助手</h2>
      <p class="about-version">版本 1.0.1</p>
      <p class="about-desc">备忘、剪切板、邮件工具</p>
      <div class="about-action">
        <button class="close-btn" type="button" @click="visible = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { StickyNote, X } from 'lucide-vue-next'
const visible = ref(false)
function show() { visible.value = true }
defineExpose({ show })
</script>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--apple-foreground) 18%, transparent);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  clip-path: inset(0 round var(--radius-window));
  animation: fade 0.24s var(--ease-out);
}

.about-card {
  position: relative;
  width: min(100%, 340px);
  box-sizing: border-box;
  padding: 20px 18px 16px;
  text-align: center;
  border: 1px solid var(--apple-border);
  border-radius: 16px;
  background: var(--apple-popover);
  box-shadow: var(--shadow-xl);
  animation: rise 0.32s var(--ease-spring);
}

.card-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--apple-muted-foreground);
  cursor: pointer;
  transition: background-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .card-close:hover {
    background: var(--state-error-surface);
    color: var(--apple-destructive);
  }
}

.brand-badge {
  display: grid;
  width: 44px;
  height: 44px;
  margin: 0 auto 10px;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--apple-primary) 12%, var(--apple-background));
  color: var(--apple-primary);
}

.about-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--apple-foreground);
}

.about-version {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-primary);
}

.about-desc {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--apple-muted-foreground);
}

.about-action {
  margin-top: 10px;
}

.close-btn {
  min-width: 120px;
  height: 36px;
  padding: 0 24px;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--apple-primary);
  color: var(--apple-primary-foreground);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s var(--ease-out), filter 0.15s var(--ease-out);
}

.close-btn:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .close-btn:hover {
    filter: brightness(0.95);
  }
}
</style>
