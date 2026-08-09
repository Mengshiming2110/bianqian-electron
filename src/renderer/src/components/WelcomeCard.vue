<template>
  <div v-if="visible" class="welcome-overlay">
    <div class="welcome-card">
      <h3>领益工作助手</h3>
      <div class="welcome-features">
        <div><b>备忘</b> 记录待办和事项</div>
        <div><b>剪切板</b> 找回复制过的内容</div>
        <div><b>邮件</b> 拉取公司出货邮件</div>
      </div>
      <p class="welcome-tip">托盘图标可切换功能，F3 隐藏窗口，拖到屏幕边缘可吸附</p>
      <button class="confirm-btn" @click="dismiss">进入</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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
.welcome-overlay { position: fixed; inset: 0; z-index: 2000; overflow: hidden; border-radius: var(--radius-window); background: var(--bg-overlay); backdrop-filter: blur(4px); clip-path: inset(0 round var(--radius-window)); display: grid; place-items: center; padding: 18px; animation: overlay-in var(--dur-base) var(--ease-out); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
.welcome-card { box-sizing: border-box; width: 100%; max-width: 190px; padding: 22px 14px 18px; text-align: center; border: 1px solid var(--border); border-radius: 14px; background: var(--bg-elevated); box-shadow: var(--shadow-pop); animation: card-in var(--dur-base) var(--ease-spring); }
@keyframes card-in { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.welcome-card h3 { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px; white-space: nowrap; }
.welcome-features { text-align: left; font-size: 11px; color: var(--text-muted); line-height: 1.75; margin-bottom: 12px; }
.welcome-features b { color: var(--text); }
.welcome-tip { font-size: 10px; color: var(--text-muted); opacity: 0.72; margin-bottom: 14px; line-height: 1.45; }
.confirm-btn { box-sizing: border-box; width: 100%; height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.confirm-btn:hover { background: var(--accent-strong); }
</style>
