<template>
  <section class="mail-panel">
    <!-- 未配置 -->
    <div v-if="!store.configured" class="login-area">
      <div class="login-card">
        <div class="login-icon"><Mail :size="24" /></div>
        <h3>连接 Exchange</h3>
        <p>输入公司邮箱信息，自动拉取出货邮件</p>
        <form @submit.prevent="handleConfig" class="mail-form">
          <label class="field"><span>Exchange 服务器</span><input v-model="form.server" placeholder="mail.company.com" required></label>
          <label class="field"><span>邮箱地址</span><input v-model="form.email" placeholder="zhang.wei@company.com" required></label>
          <label class="field"><span>密码</span><input v-model="form.password" type="password" placeholder="邮箱密码" required></label>
          <button type="submit" class="save-btn" :disabled="connecting">{{ connecting ? '连接中...' : '连接邮箱' }}</button>
          <p class="error-msg" v-if="store.error">{{ store.error }}</p>
        </form>
        <p class="login-help">需要帮助？联系 IT 部门获取 Exchange 地址</p>
      </div>
    </div>

    <!-- 已连接 -->
    <div v-else style="flex:1;min-height:0;display:flex;flex-direction:column">
      <div class="mail-toolbar">
        <span>{{ store.mails.length }} 封邮件</span>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="status-dot" :class="store.isRunning ? 'on' : 'off'"></span>
          <button class="mini-btn" title="拉取" @click="handleFetch"><RefreshCw :size="14" /></button>
          <button class="mini-btn" title="断开" @click="handleStop"><Power :size="14" /></button>
        </div>
      </div>
      <div class="mail-list" v-if="store.mails.length">
        <div v-for="mail in store.mails" :key="mail.id" class="mail-card" :class="{ unread: !mail.is_read }" @click="store.openDetail(mail.id)">
          <div class="mail-top"><strong>{{ mail.subject }}</strong><time>{{ relativeTime(mail.received_at) }}</time></div>
          <div class="mail-from">{{ mail.sender }}</div>
          <div class="mail-preview">{{ (mail.body || '').slice(0, 100) }}</div>
        </div>
      </div>
      <div v-else class="empty-state">
        <Mail :size="30" /><p>暂无邮件</p>
        <button class="save-btn" style="margin-top:8px" @click="handleFetch">手动拉取</button>
      </div>
    </div>

    <!-- 详情 -->
    <div v-if="store.selectedMail" class="detail-overlay" @click.self="store.closeDetail()">
      <div class="detail-panel">
        <div class="detail-header"><h3>{{ store.selectedMail.subject }}</h3><button class="mini-btn" @click="store.closeDetail()"><X :size="14" /></button></div>
        <div class="detail-meta"><span>{{ store.selectedMail.sender }}</span><span>{{ relativeTime(store.selectedMail.received_at) }}</span></div>
        <div class="detail-body">{{ store.selectedMail.body }}</div>
        <table class="extract-table" v-if="store.selectedMail.extracted_fields">
          <tbody><tr v-for="(v,k) in parseFields(store.selectedMail.extracted_fields)" :key="k"><td>{{ k }}</td><td @click="copyVal(v)">{{ v }}</td></tr></tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Mail, RefreshCw, Power, X } from 'lucide-vue-next'
import { useMailStore } from '../stores/mail'

const store = useMailStore()
const form = ref({ server: '', email: '', password: '' })
const connecting = ref(false)

onMounted(async () => {
  await store.load()
  const saved = await window.api?.settings?.get()
  if (saved?.mailConfig) form.value = saved.mailConfig
})

async function handleConfig() {
  connecting.value = true; store.error = null
  await window.api?.settings?.save({ mailConfig: form.value })
  await store.configure(form.value)
  connecting.value = false
}
async function handleFetch() { await store.fetch() }
async function handleStop() { await store.stop() }
function parseFields(raw) {
  try { const f = typeof raw === 'string' ? JSON.parse(raw) : raw; return f && typeof f === 'object' ? f : {} } catch { return {} }
}
async function copyVal(v) { try { await navigator.clipboard.writeText(String(v)) } catch {} }
function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.mail-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.login-area { display: grid; place-items: center; min-height: 260px; padding: 16px; }
.login-card { width: 100%; padding: 24px 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-card); text-align: center; }
.login-icon { width: 44px; height: 44px; border-radius: 8px; background: var(--accent-soft); border: 1px solid rgba(47,125,120,0.12); display: grid; place-items: center; margin: 0 auto 12px; color: var(--accent); }
.login-card h3 { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.login-card > p { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5; }
.mail-form { display: flex; flex-direction: column; gap: 8px; text-align: left; }
.field { display: grid; gap: 4px; }
.field span { font-size: 11px; color: var(--text-muted); }
.field input { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--text); font-size: 12px; font-family: inherit; outline: 0; }
.field input:focus { border-color: var(--accent); }
.save-btn { height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.save-btn:hover { opacity: 0.9; }
.login-help { font-size: 11px; color: var(--text-muted); margin-top: 10px; }
.error-msg { font-size: 11px; color: var(--danger); margin-top: 4px; }
.mail-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 0 14px 6px; font-size: 11px; color: var(--text-muted); }
.status-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
.status-dot.on { background: var(--accent); }
.status-dot.off { background: var(--text-muted); }
.mail-list { flex: 1; overflow-y: auto; padding: 0 12px; display: flex; flex-direction: column; gap: 6px; }
.mail-card { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); cursor: pointer; transition: border-color 0.15s; }
.mail-card:hover { border-color: var(--accent); }
.mail-card.unread { border-left: 2px solid var(--accent); }
.mail-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
.mail-top strong { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.mail-top time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.mail-from { font-size: 11px; color: var(--accent); margin-bottom: 2px; }
.mail-preview { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-btn { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; }
.mini-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.empty-state { display: grid; place-items: center; align-content: center; min-height: 160px; color: var(--text-muted); font-size: 13px; gap: 4px; }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--bg-overlay); display: grid; place-items: center; padding: 12px; }
.detail-panel { width: 100%; max-height: 80vh; padding: 14px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--border); box-shadow: var(--shadow); overflow-y: auto; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.detail-header h3 { font-size: 15px; font-weight: 600; color: var(--text); }
.detail-meta { font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.detail-body { font-size: 12px; color: var(--text); line-height: 1.6; margin-bottom: 10px; white-space: pre-wrap; }
.extract-table { width: 100%; border-collapse: collapse; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.extract-table td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid var(--border); }
.extract-table td:first-child { color: var(--text-muted); }
.extract-table td:last-child { text-align: right; font-weight: 600; color: var(--accent); cursor: pointer; }
.extract-table td:last-child:hover { text-decoration: underline; }
.extract-table tr:last-child td { border-bottom: none; }
</style>
