<template>
  <div class="mail-panel" style="display:flex;flex-direction:column;gap:6px;min-height:0">
    <!-- ===== 未配置状态 ===== -->
    <div v-if="!store.configured" style="display:grid;place-items:center;align-content:center;min-height:260px;padding:12px 16px">
      <div class="login-card-outer">
        <div class="login-card">
          <div class="login-icon"><svg><use href="#ic-mail"/></svg></div>
          <h3>连接 Exchange</h3>
          <p>输入公司邮箱信息，自动拉取出货邮件</p>
          <form @submit.prevent="handleConfig" style="display:flex;flex-direction:column;gap:10px">
            <div class="field">
              <label>Exchange 服务器</label>
              <input v-model="form.server" type="text" placeholder="mail.company.com" required>
            </div>
            <div class="field">
              <label>邮箱地址</label>
              <input v-model="form.email" type="email" placeholder="zhang.wei@company.com" required>
            </div>
            <div class="field">
              <label>密码</label>
              <input v-model="form.password" type="password" placeholder="邮箱密码" required>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="connecting" style="width:100%;margin-top:4px">
              {{ connecting ? '连接中...' : '连接邮箱' }}
            </button>
          </form>
          <p class="error-msg" v-if="store.error">{{ store.error }}</p>
          <div class="login-footer">需要帮助？联系 IT 部门获取 Exchange 地址</div>
        </div>
      </div>
    </div>

    <!-- ===== 已连接状态 ===== -->
    <div v-else>
      <div class="mail-toolbar">
        <span>{{ store.mails.length }} 封邮件</span>
        <div class="m-status">
          <span class="m-dot" :class="store.isRunning ? 'on' : 'err'"></span>
          <button class="mini-btn" title="手动拉取" @click="handleFetch">
            <svg><use href="#ic-refresh"/></svg>
          </button>
          <button class="mini-btn" title="断开连接" @click="handleStop">
            <svg><use href="#ic-power"/></svg>
          </button>
        </div>
      </div>

      <div style="overflow-y:auto;min-height:0;padding:0 12px;display:flex;flex-direction:column;gap:4px">
        <div v-for="mail in store.mails" :key="mail.id" class="card-wrap">
          <div class="card mail-card" :class="{ unread: !mail.is_read }" @click="store.openDetail(mail.id)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <strong class="mail-subject">{{ mail.subject }}</strong>
              <time style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">{{ relativeTime(mail.received_at) }}</time>
            </div>
            <div class="mail-from">{{ mail.sender }}</div>
            <div class="mail-snippet">{{ (mail.body || '').slice(0, 100) }}</div>
          </div>
        </div>

        <div v-if="!store.mails.length" style="display:grid;place-items:center;min-height:160px;color:var(--text-tertiary);font-size:12px">
          <svg style="width:28px;height:28px;opacity:0.5;margin-bottom:6px"><use href="#ic-mail"/></svg>
          <p>暂无邮件</p>
          <p style="font-size:10px;opacity:0.7;margin-top:2px" v-if="store.lastSync">上次同步：{{ formatTime(store.lastSync) }}</p>
          <button class="btn btn-secondary" style="margin-top:8px" @click="handleFetch">手动拉取</button>
        </div>
      </div>
    </div>

    <!-- ===== 详情弹窗 ===== -->
    <div v-if="store.selectedMail" class="detail-overlay" @click.self="store.closeDetail()">
      <div class="detail-panel">
        <div class="detail-header">
          <h3>{{ store.selectedMail.subject }}</h3>
          <button class="mini-btn" @click="store.closeDetail()"><svg style="width:14px;height:14px"><use href="#ic-x"/></svg></button>
        </div>
        <div class="detail-meta">
          <span>发件人：{{ store.selectedMail.sender }}</span>
          <span>时间：{{ relativeTime(store.selectedMail.received_at) }}</span>
        </div>
        <div class="detail-body">{{ store.selectedMail.body }}</div>

        <!-- 提取字段表 -->
        <table class="extract-table" v-if="extractedFields.length">
          <tbody>
            <tr v-for="(field, idx) in extractedFields" :key="idx">
              <td>{{ field.label }}</td>
              <td @click="copyToClipboard(field.value)">{{ field.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMailStore } from '../stores/mail'

const store = useMailStore()
const form = ref({ server: '', email: '', password: '' })
const connecting = ref(false)

onMounted(async () => {
  await store.load()
  // 从 settings 读取已保存配置
  const saved = await window.api.settings?.get()
  if (saved?.mailConfig) {
    form.value = saved.mailConfig
  }
})

const extractedFields = computed(() => {
  if (!store.selectedMail?.extracted_fields) return []
  try {
    const fields = typeof store.selectedMail.extracted_fields === 'string'
      ? JSON.parse(store.selectedMail.extracted_fields)
      : store.selectedMail.extracted_fields
    if (!fields || typeof fields !== 'object') return []
    return Object.entries(fields).map(([k, v]) => ({ label: k, value: String(v) }))
  } catch { return [] }
})

async function handleConfig() {
  connecting.value = true
  store.error = null
  // 保存配置到 settings
  await window.api.settings?.save({ mailConfig: form.value })
  await store.configure(form.value)
  connecting.value = false
}

async function handleFetch() {
  await store.fetch()
}

async function handleStop() {
  await store.stop()
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {}
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>
