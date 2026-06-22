<template>
  <section class="mail-panel">
    <!-- 未配置 -->
    <div v-if="!store.configured" class="login-area">
      <div class="login-card">
        <div class="login-icon"><Mail :size="24" /></div>
        <h3>连接公司邮箱</h3>
        <p>Exchange 账户登录后可自动拉取出货单邮件</p>
        <form @submit.prevent="handleConfig" class="mail-form">
          <label class="field"><span>Exchange 服务器</span><input v-model="form.server" placeholder="mail.lingyiitech.com" required @input="scheduleSaveMailIdentity"></label>
          <label class="field"><span>邮箱地址</span><input v-model="form.email" placeholder="zhang.wei@company.com" required @input="scheduleSaveMailIdentity"></label>
          <div class="field-row">
            <label class="field"><span>AD 域</span><input v-model="form.domain" placeholder="LSTECH" required @input="scheduleSaveMailIdentity"></label>
            <label class="field"><span>AD 账号</span><input v-model="form.domainUser" placeholder="zhang.wei" required @input="scheduleSaveMailIdentity"></label>
          </div>
          <label class="field"><span>密码</span><input v-model="form.password" type="password" placeholder="邮箱密码" required></label>
          <div class="mail-actions">
            <button type="submit" class="save-btn" :disabled="connecting">{{ connecting ? '连接中...' : '连接邮箱' }}</button>
            <button type="button" class="diagnose-btn" :disabled="store.doctorRunning" @click="handleDoctor">
              {{ store.doctorRunning ? '诊断中' : '诊断' }}
            </button>
          </div>
          <div class="doctor-card" v-if="store.doctorResult">
            <div class="doctor-title">
              <span :class="['status-dot', store.doctorResult.ok ? 'on' : 'off']"></span>
              <strong>{{ store.doctorResult.ok ? '配置已就绪' : '配置待补充' }}</strong>
            </div>
            <dl>
              <div><dt>依赖</dt><dd>{{ store.doctorResult.dependency?.exchangelib ? '正常' : (store.doctorResult.dependency?.error || '异常') }}</dd></div>
              <div><dt>服务器</dt><dd>{{ store.doctorResult.config?.server || form.server || DEFAULT_MAIL_SERVER }}</dd></div>
              <div><dt>AD 域</dt><dd>{{ store.doctorResult.config?.domain || form.domain || DEFAULT_MAIL_DOMAIN }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ store.doctorResult.config?.smtp_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>账号</dt><dd>{{ store.doctorResult.config?.domain_user_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>密码</dt><dd>{{ store.doctorResult.config?.password_present ? '已填写' : '未填写' }}</dd></div>
            </dl>
            <p v-if="store.doctorResult.error || store.doctorResult.last_error">{{ store.doctorResult.error || store.doctorResult.last_error }}</p>
          </div>
          <div class="mail-error-card" v-if="store.error" role="alert">
            <div class="mail-error-title">
              <AlertCircle :size="15" />
              <span>连接未完成</span>
            </div>
            <p>{{ store.error }}</p>
            <dl>
              <div><dt>服务器</dt><dd>{{ form.server || DEFAULT_MAIL_SERVER }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ form.email || '未填写' }}</dd></div>
              <div><dt>AD 域</dt><dd>{{ form.domain || DEFAULT_MAIL_DOMAIN }}</dd></div>
              <div><dt>域账号</dt><dd>{{ form.domainUser || '未填写' }}</dd></div>
            </dl>
          </div>
        </form>
        <p class="login-help">登录信息会记住服务器、邮箱、AD 域和账号，不保存密码。</p>
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
        <Mail :size="30" />
        <p>还没有拉取到邮件</p>
        <small>保持公司网络连接后刷新，系统会读取最近的收件箱邮件。</small>
        <button class="save-btn compact" @click="handleFetch">立即刷新</button>
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
import { ref, onBeforeUnmount, onMounted } from 'vue'
import { AlertCircle, Mail, RefreshCw, Power, X } from 'lucide-vue-next'
import { useMailStore } from '../stores/mail'

const store = useMailStore()
const DEFAULT_MAIL_DOMAIN = 'LSTECH'
const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const form = ref({ server: DEFAULT_MAIL_SERVER, email: '', domainUser: '', domain: DEFAULT_MAIL_DOMAIN, password: '' })
const connecting = ref(false)
let saveIdentityTimer = null

onMounted(async () => {
  await store.load()
  const saved = await window.api?.settings?.get()
  if (saved?.mailConfig) {
    form.value = {
      server: saved.mailConfig.server || DEFAULT_MAIL_SERVER,
      email: saved.mailConfig.email || '',
      domainUser: saved.mailConfig.domainUser || '',
      domain: saved.mailConfig.domain || DEFAULT_MAIL_DOMAIN,
      password: ''
    }
  }
})

async function handleConfig() {
  connecting.value = true
  store.error = null
  try {
    await saveMailIdentity()
    await store.configure(mailConfigPayload())
  } catch (err) {
    store.error = store.mapError(err?.message || err || '连接失败')
  } finally {
    connecting.value = false
  }
}
async function handleDoctor() {
  await saveMailIdentity()
  await store.doctor(mailConfigPayload())
}
async function handleFetch() { await store.fetch() }
async function handleStop() { await store.stop() }
function scheduleSaveMailIdentity() {
  if (saveIdentityTimer) clearTimeout(saveIdentityTimer)
  saveIdentityTimer = setTimeout(() => {
    saveMailIdentity()
  }, 500)
}
async function saveMailIdentity() {
  if (saveIdentityTimer) {
    clearTimeout(saveIdentityTimer)
    saveIdentityTimer = null
  }
  await window.api?.settings?.save({
    mailConfig: {
      ...mailConfigPayload(),
      password: ''
    }
  })
}
function mailConfigPayload() {
  return {
    server: String(form.value.server || DEFAULT_MAIL_SERVER).trim() || DEFAULT_MAIL_SERVER,
    email: String(form.value.email || '').trim(),
    domainUser: String(form.value.domainUser || '').trim(),
    domain: String(form.value.domain || DEFAULT_MAIL_DOMAIN).trim() || DEFAULT_MAIL_DOMAIN,
    password: String(form.value.password || '')
  }
}
onBeforeUnmount(() => {
  if (saveIdentityTimer) clearTimeout(saveIdentityTimer)
})
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
.mail-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.login-area { display: grid; min-height: 0; padding: 8px 18px 4px; }
.login-card { width: 100%; align-self: start; padding: 20px 18px 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-card); text-align: center; }
.login-icon { width: 42px; height: 42px; border-radius: 8px; background: var(--accent-soft); border: 1px solid rgba(47,125,120,0.12); display: grid; place-items: center; margin: 0 auto 12px; color: var(--accent); }
.login-card h3 { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.login-card > p { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.45; }
.mail-form { display: flex; flex-direction: column; gap: 7px; text-align: left; }
.field-row { display: grid; grid-template-columns: minmax(78px, 0.8fr) minmax(0, 1.2fr); gap: 8px; }
.field { display: grid; gap: 4px; }
.field span { font-size: 11px; color: var(--text-muted); }
.field input { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--text); font-size: 12px; font-family: inherit; outline: 0; }
.field input:focus { border-color: var(--accent); }
.mail-actions { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 8px; }
.save-btn { height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.save-btn.compact { height: 34px; margin-top: 6px; padding: 0 18px; }
.save-btn:hover { opacity: 0.9; }
.diagnose-btn { height: 38px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--text); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.diagnose-btn:hover { background: var(--accent-soft); color: var(--accent-strong); }
.login-help { font-size: 11px; color: var(--text-muted); margin-top: 9px; }
.doctor-card {
  display: grid;
  gap: 6px;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input);
}
.doctor-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 12px;
}
.doctor-card dl {
  display: grid;
  gap: 3px;
  margin: 0;
}
.doctor-card dl div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 7px;
  font-size: 10px;
}
.doctor-card dt,
.doctor-card dd {
  margin: 0;
  color: var(--text-muted);
}
.doctor-card dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doctor-card p {
  margin: 0;
  color: var(--danger);
  font-size: 10px;
  line-height: 1.4;
}
.mail-error-card {
  display: grid;
  gap: 6px;
  margin-top: 2px;
  padding: 9px;
  border: 1px solid rgba(226, 74, 74, 0.26);
  border-radius: 8px;
  background: rgba(226, 74, 74, 0.07);
  color: var(--text);
}
.mail-error-title {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}
.mail-error-card p {
  margin: 0;
  color: var(--text);
  font-size: 11px;
  line-height: 1.45;
}
.mail-error-card dl {
  display: grid;
  gap: 3px;
  margin: 0;
}
.mail-error-card dl div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 7px;
  font-size: 10px;
}
.mail-error-card dt {
  color: var(--text-muted);
}
.mail-error-card dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 0 14px 6px; font-size: 11px; color: var(--text-muted); }
.status-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
.status-dot.on { background: var(--accent); }
.status-dot.off { background: var(--text-muted); }
.mail-list { flex: 1; overflow-y: auto; padding: 0 12px; display: flex; flex-direction: column; gap: 6px; }
.mail-card { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); cursor: pointer; transition: filter 0.15s, background 0.15s; }
.mail-card:hover { filter: brightness(1.04); background: var(--bg-card-hover); }
.mail-card:active { transform: scale(0.99); }
.mail-card.unread { border-left: 2px solid var(--accent); }
.mail-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
.mail-top strong { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.mail-top time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.mail-from { font-size: 11px; color: var(--accent); margin-bottom: 2px; }
.mail-preview { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-btn { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; }
.mini-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.empty-state { display: grid; place-items: center; align-content: center; min-height: 180px; padding: 14px 26px; color: var(--text-muted); font-size: 13px; gap: 5px; text-align: center; }
.empty-state p { margin: 0; color: var(--text); font-weight: 600; }
.empty-state small { color: var(--text-muted); font-size: 11px; line-height: 1.45; }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; overflow: hidden; border-radius: var(--radius-window); background: var(--bg-overlay); clip-path: inset(0 round var(--radius-window)); display: grid; place-items: center; padding: 12px; }
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
