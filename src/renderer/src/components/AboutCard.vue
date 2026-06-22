<template>
  <div v-if="visible" class="about-overlay" @click.self="visible = false">
    <div class="about-card">
      <h3>领益工作助手</h3>
      <p class="about-ver">版本 1.0.0</p>
      <p class="about-desc">备忘、剪切板、邮件工具</p>
      <button class="confirm-btn" @click="visible = false" style="margin-top:8px">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const visible = ref(false)
function show() { visible.value = true }
defineExpose({ show })
</script>

<style scoped>
.about-overlay { position: fixed; inset: 0; z-index: 2000; overflow: hidden; border-radius: var(--radius-window); background: var(--bg-overlay); backdrop-filter: blur(4px); clip-path: inset(0 round var(--radius-window)); display: grid; place-items: center; padding: 20px; }
.about-card { width: min(100%, 280px); padding: 24px 20px; text-align: center; border: 1px solid var(--border); border-radius: 14px; background: var(--bg-elevated); box-shadow: var(--shadow); }
.about-card h3 { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.about-ver { font-size: 13px; color: var(--accent); font-weight: 600; margin-bottom: 8px; }
.about-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.confirm-btn { width: 100%; height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.confirm-btn:hover { opacity: 0.9; }
</style>
