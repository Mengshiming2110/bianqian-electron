<template>
  <div class="about-overlay" v-if="visible" @click.self="visible = false">
    <div class="about-card">
      <h3>Ezio的百宝箱</h3>
      <div class="version">版本 1.0.0</div>
      <p>便签 · 剪切板 · 邮件<br>三合一桌面工具箱</p>
      <p style="font-size:10px;color:var(--text-tertiary)">基于 Electron + Vue 3 构建</p>
      <button class="btn btn-secondary" @click="visible = false" style="margin-top:6px">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)

function show() { visible.value = true }

defineExpose({ show })
</script>
