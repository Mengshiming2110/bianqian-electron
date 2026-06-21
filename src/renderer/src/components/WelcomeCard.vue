<template>
  <div class="welcome-overlay" v-if="visible">
    <div class="welcome-card">
      <div class="w-icon">🎒</div>
      <h3>欢迎使用 Ezio的百宝箱</h3>
      <div class="w-features">
        <div>📋 <b>便签</b> — 记录待办、备忘，支持 Markdown 和提醒</div>
        <div>📎 <b>剪切板</b> — 自动记录复制过的文字，搜索找回</div>
        <div>📧 <b>邮件</b> — 连接公司邮箱，自动拉取出货邮件</div>
      </div>
      <div class="w-tip">
        右键托盘图标可以快速切换<br>
        按 F3 可以随时隐藏/显示窗口
      </div>
      <button class="btn btn-primary" @click="dismiss" style="width:100%">开始使用</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const visible = ref(false)

onMounted(async () => {
  const settings = await window.api?.settings?.get()
  if (!settings?.welcomed) {
    visible.value = true
  }
})

async function dismiss() {
  visible.value = false
  await window.api?.settings?.save({ welcomed: true })
}
</script>
