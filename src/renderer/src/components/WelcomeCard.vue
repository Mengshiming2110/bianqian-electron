<template>
  <div v-if="visible" class="welcome-overlay">
    <div class="welcome-card">
      <h3>便签</h3>
      <div class="welcome-features">
        <div><b>便签</b> 记录待办和备忘</div>
        <div><b>剪切板</b> 找回复制过的内容</div>
        <div><b>邮件</b> 拉取公司出货邮件</div>
      </div>
      <p class="welcome-tip">托盘图标可切换功能，F3 隐藏窗口</p>
      <button class="confirm-btn" @click="dismiss">进入</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
const visible = ref(false)
onMounted(async () => {
  const settings = await window.api?.settings?.get()
  if (!settings?.welcomed) visible.value = true
})
async function dismiss() {
  visible.value = false
  await window.api?.settings?.save({ welcomed: true })
}
</script>

<style scoped>
.welcome-overlay { position: fixed; inset: 0; z-index: 2000; overflow: hidden; border-radius: var(--radius-window); background: var(--bg-overlay); backdrop-filter: blur(4px); clip-path: inset(0 round var(--radius-window)); display: grid; place-items: center; padding: 20px; }
.welcome-card { width: min(100%, 280px); padding: 24px 20px; text-align: center; border: 1px solid var(--border); border-radius: 14px; background: var(--bg-elevated); box-shadow: var(--shadow); }
.welcome-card h3 { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 14px; }
.welcome-features { text-align: left; font-size: 12px; color: var(--text-muted); line-height: 2; margin-bottom: 12px; }
.welcome-features b { color: var(--text); }
.welcome-tip { font-size: 10px; color: var(--text-muted); opacity: 0.7; margin-bottom: 16px; }
.confirm-btn { width: 100%; height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.confirm-btn:hover { opacity: 0.9; }
</style>
