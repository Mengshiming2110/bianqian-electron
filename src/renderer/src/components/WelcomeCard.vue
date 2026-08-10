<template>
  <div v-if="visible" class="welcome-overlay" role="dialog" aria-modal="true" aria-label="首次启动欢迎引导">
    <div class="welcome-card">
      <div class="brand-badge"><StickyNote :size="24" /></div>
      <h2 class="welcome-title">领益工作助手</h2>
      <ul class="feature-list">
        <li class="feature-row">
          <StickyNote :size="16" class="feature-icon" />
          <p class="feature-text"><span class="feature-label">备忘</span> · 记录待办和事项</p>
        </li>
        <li class="feature-row">
          <ClipboardList :size="16" class="feature-icon" />
          <p class="feature-text"><span class="feature-label">剪切板</span> · 找回复制过的内容</p>
        </li>
        <li class="feature-row">
          <Mail :size="16" class="feature-icon" />
          <p class="feature-text"><span class="feature-label">邮件</span> · 拉取公司出货邮件</p>
        </li>
      </ul>
      <p class="welcome-tip">托盘图标可切换功能，F3 隐藏窗口，拖到屏幕边缘可吸附</p>
      <button class="enter-btn" type="button" @click="dismiss">进入</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ClipboardList, Mail, StickyNote } from 'lucide-vue-next'
const emit = defineEmits(['dismiss'])
const visible = ref(false)
onMounted(async () => {
  const settings = await window.api?.settings?.get()
  if (!settings?.welcomed) visible.value = true
})
async function dismiss() {
  visible.value = false
  try {
    await window.api?.settings?.save({ welcomed: true })
  } catch (err) {
    console.error('[WelcomeCard] save failed:', err)
  } finally {
    emit('dismiss')
  }
}
</script>

<style scoped>
.welcome-overlay {
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

.welcome-card {
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
  padding: 20px 18px 16px;
  text-align: center;
  border: 1px solid var(--apple-border);
  border-radius: 16px;
  background: var(--apple-popover);
  box-shadow: var(--shadow-xl);
  animation: rise 0.32s var(--ease-spring);
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

.welcome-title {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 700;
  color: var(--apple-foreground);
}

.feature-list {
  display: grid;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  text-align: left;
}

.feature-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--apple-radius-md);
  background: var(--apple-muted);
  font-size: 12px;
  color: var(--apple-muted-foreground);
}

.feature-icon {
  flex: none;
  color: var(--apple-primary);
}

.feature-text {
  margin: 0;
  line-height: 1.5;
}

.feature-label {
  font-weight: 600;
  color: var(--apple-foreground);
}

.welcome-tip {
  margin: 0 0 16px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--apple-muted-foreground);
  opacity: 0.8;
}

.enter-btn {
  width: 100%;
  height: 38px;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--apple-primary);
  color: var(--apple-primary-foreground);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s var(--ease-out), filter 0.15s var(--ease-out);
}

.enter-btn:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .enter-btn:hover {
    filter: brightness(0.95);
  }
}
</style>
