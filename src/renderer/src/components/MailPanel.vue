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
              <div><dt>DNS</dt><dd>{{ store.doctorResult.network?.dns ? (store.doctorResult.network?.address || '正常') : '未通' }}</dd></div>
              <div><dt>端口</dt><dd>{{ store.doctorResult.network?.tcp ? `443 已通` : '443 未通' }}</dd></div>
              <div><dt>AD 域</dt><dd>{{ store.doctorResult.config?.domain || form.domain || DEFAULT_MAIL_DOMAIN }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ store.doctorResult.config?.smtp_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>账号</dt><dd>{{ store.doctorResult.config?.domain_user_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>密码</dt><dd>{{ store.doctorResult.config?.password_present ? '已填写' : '未填写' }}</dd></div>
            </dl>
            <p v-if="store.doctorResult.network?.error">{{ store.doctorResult.network.error }}</p>
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
    <div v-else class="mail-connected">
      <div class="mail-toolbar">
        <span>{{ store.mails.length }} 封邮件</span>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="status-dot" :class="store.connected ? 'on' : 'off'" :title="store.connected ? '已连接' : '连接中断，自动重连中'"></span>
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
        <div class="detail-header"><h3>{{ displaySummary?.title || store.selectedMail.subject }}</h3><button class="mini-btn" @click="store.closeDetail()"><X :size="14" /></button></div>
        <div class="detail-meta"><span>{{ store.selectedMail.sender }}</span><span>{{ relativeTime(store.selectedMail.received_at) }}</span></div>

        <!-- Excel 加载中 -->
        <div v-if="excelLoading" class="detail-body" style="text-align:center;padding:24px;color:var(--text-muted)">解析附件中...</div>

        <!-- 任务卡片（正文 或 Excel 共用） -->
        <div v-else-if="displaySummary" class="task-detail">
          <div class="task-brief">
            <div class="brief-grid">
              <div class="brief-item">
                <span>出货客户</span>
                <strong>{{ displaySummary.brief.customer }}</strong>
              </div>
              <div class="brief-item">
                <span>出货日期</span>
                <strong>{{ displaySummary.brief.shipmentDate }}</strong>
              </div>
              <div class="brief-item owner" :class="{ muted: displaySummary.brief.salesOwnerMissing }">
                <span>销售负责人</span>
                <strong>{{ displaySummary.brief.salesOwner }}</strong>
              </div>
            </div>
            <div v-if="displaySummary.brief.notes?.length" class="brief-notes">
              <span>注意事项</span>
              <p v-for="note in displaySummary.brief.notes" :key="note">{{ note }}</p>
            </div>
          </div>

          <div v-if="displayMaterial" class="material-card">
            <div class="material-head">
              <span>第 {{ displayMaterial.index }} / {{ displayMaterial.total }} 款</span>
              <strong>{{ displayMaterial.title }}</strong>
            </div>
            <dl class="material-fields">
              <div v-for="field in displayMaterial.fields" :key="field.key">
                <dt>{{ field.label }}</dt>
                <dd>
                  <button
                    type="button"
                    class="copy-value"
                    :class="{ missing: field.missing }"
                    :disabled="!field.copyable"
                    @click="copyMaterialValue(field)"
                  >{{ field.value }}</button>
                </dd>
              </div>
            </dl>
            <div v-if="displayMaterialTotal > 1" class="material-pager">
              <button type="button" class="pager-btn" :disabled="displayMaterialPage === 0" @click="activeAttachment ? (excelMaterialPage -= 1) : (materialPage -= 1)">上一款</button>
              <span>{{ displayMaterialPage + 1 }} / {{ displayMaterialTotal }}</span>
              <button type="button" class="pager-btn" :disabled="displayMaterialPage >= displayMaterialTotal - 1" @click="activeAttachment ? (excelMaterialPage += 1) : (materialPage += 1)">下一款</button>
            </div>
          </div>
          <p v-if="copyToast" class="copy-toast">{{ copyToast }}</p>

          <!-- 正文视图：查看原文 + 查看附件 -->
          <div v-if="!activeAttachment">
            <details v-if="sanitizedMailHtml || store.selectedMail.body" class="original-mail">
              <summary>查看原文</summary>
              <div v-if="sanitizedMailHtml" class="detail-body html-body" v-html="sanitizedMailHtml"></div>
              <div v-else class="detail-body">{{ store.selectedMail.body }}</div>
            </details>
            <div v-if="excelAttachments.length" class="attachment-bar">
              <button type="button" class="attach-btn"
                @click="excelAttachments.length === 1 ? openAttachment(excelAttachments[0].filename) : (showAttachmentPicker = true)">
                查看附件 ({{ excelAttachments.length }})
              </button>
            </div>
          </div>

          <!-- 附件视图：退回入口 -->
          <div v-else class="attachment-bar">
            <button type="button" class="attach-btn back" @click="backToHtml">退回正文</button>
          </div>
        </div>

        <!-- 无表格时回退：原文 -->
        <div v-else-if="sanitizedMailHtml" class="detail-body html-body" v-html="sanitizedMailHtml"></div>
        <div v-else class="detail-body">{{ store.selectedMail.body }}</div>

        <table class="extract-table" v-if="!displaySummary && store.selectedMail.extracted_fields">
          <tbody><tr v-for="(v,k) in parseFields(store.selectedMail.extracted_fields)" :key="k"><td>{{ k }}</td><td @click="copyVal(v)">{{ v }}</td></tr></tbody>
        </table>

        <!-- 多附件选择器 -->
        <div v-if="showAttachmentPicker" class="picker-overlay" @click.self="showAttachmentPicker = false">
          <div class="picker-list">
            <div class="picker-title">选择附件</div>
            <button
              v-for="att in excelAttachments" :key="att.filename"
              type="button" class="picker-item"
              @click="openAttachment(att.filename)"
            >
              <span>{{ att.filename }}</span>
              <span class="picker-size">{{ formatSize(att.size) }}</span>
            </button>
            <button type="button" class="picker-item muted" @click="showAttachmentPicker = false">取消</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import DOMPurify from 'dompurify'
import { AlertCircle, Mail, RefreshCw, Power, X } from 'lucide-vue-next'
import { useMailStore } from '../stores/mail'
import { buildMailTaskSummary, buildExcelTaskSummary } from '../lib/mail-detail-summary.mjs'

const store = useMailStore()
const DEFAULT_MAIL_DOMAIN = 'LSTECH'
const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const form = ref({ server: DEFAULT_MAIL_SERVER, email: '', domainUser: '', domain: DEFAULT_MAIL_DOMAIN, password: '' })
const connecting = ref(false)
const materialPage = ref(0)
const copyToast = ref('')
let saveIdentityTimer = null
let copyToastTimer = null

const sanitizedMailHtml = computed(() => {
  const raw = store.selectedMail?.html || ''
  if (!raw || !/<[a-z][\s\S]*>/i.test(raw)) return ''
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'a', 'b', 'br', 'blockquote', 'body', 'caption', 'col', 'colgroup', 'div', 'em',
      'font', 'h1', 'h2', 'h3', 'h4', 'hr', 'html', 'i', 'li', 'ol', 'p', 'pre',
      'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
    ],
    ALLOWED_ATTR: ['align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'colspan', 'href', 'rowspan', 'style', 'target', 'valign', 'width'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  })
})

const taskSummary = computed(() => buildMailTaskSummary(store.selectedMail, sanitizedMailHtml.value))

// ===== 附件视图 =====
const attachments = ref([])
const excelAttachments = computed(() => attachments.value.filter((a) => /\.xlsx?$/i.test(a.filename)))
const activeAttachment = ref(null)
const excelSummary = ref(null)
const excelLoading = ref(false)
const showAttachmentPicker = ref(false)
const excelMaterialPage = ref(0)

const displaySummary = computed(() => (activeAttachment.value && excelSummary.value) ? excelSummary.value : taskSummary.value)
const displayMaterial = computed(() => {
  if (activeAttachment.value && excelSummary.value) {
    return excelSummary.value.materials?.[excelMaterialPage.value] || null
  }
  return taskSummary.value?.materials?.[materialPage.value] || null
})
const displayMaterialPage = computed(() => activeAttachment.value ? excelMaterialPage.value : materialPage.value)
const displayMaterialTotal = computed(() => displaySummary.value?.materials?.length || 0)

let attachReqId = 0
watch(() => store.selectedMail?.id, async (id) => {
  materialPage.value = 0
  excelMaterialPage.value = 0
  copyToast.value = ''
  activeAttachment.value = null
  excelSummary.value = null
  attachments.value = []
  const reqId = ++attachReqId
  if (id) {
    try {
      const list = await window.api?.mail?.attachments(id) || []
      if (reqId === attachReqId) attachments.value = list
    } catch (err) { console.error('[MailPanel] attachments:', err) }
  }
})

async function openAttachment(filename) {
  showAttachmentPicker.value = false
  excelLoading.value = true
  excelMaterialPage.value = 0
  activeAttachment.value = filename
  try {
    const result = await window.api?.mail?.attachmentContent(store.selectedMail.id, filename)
    if (result?.buffer) {
      excelSummary.value = buildExcelTaskSummary(result.buffer, result.filename || filename)
    } else {
      activeAttachment.value = null
    }
  } catch (err) {
    console.error('[attachment] 加载失败:', err)
    activeAttachment.value = null
  } finally {
    excelLoading.value = false
  }
}

function backToHtml() {
  activeAttachment.value = null
  excelSummary.value = null
}

watch(materialPage, () => {
  copyToast.value = ''
})

watch(excelMaterialPage, () => {
  copyToast.value = ''
})

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
async function handleStop() {
  try { await store.stop() } catch (err) { console.error('[MailPanel] handleStop failed:', err) }
}
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
  try {
    await window.api?.settings?.save({
      mailConfig: {
        ...mailConfigPayload(),
        password: ''
      }
    })
  } catch (err) {
    console.error('[MailPanel] saveMailIdentity failed:', err)
  }
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
  if (copyToastTimer) clearTimeout(copyToastTimer)
})
function parseFields(raw) {
  try { const f = typeof raw === 'string' ? JSON.parse(raw) : raw; return f && typeof f === 'object' ? f : {} } catch { return {} }
}
async function copyVal(v) { try { await navigator.clipboard.writeText(String(v)) } catch {} }
async function copyMaterialValue(field) {
  if (!field?.copyable || !field.copyValue) return
  if (copyToastTimer) clearTimeout(copyToastTimer)
  try {
    await navigator.clipboard.writeText(field.copyValue)
    copyToast.value = `已复制 ${field.label}`
    copyToastTimer = setTimeout(() => {
      copyToast.value = ''
      copyToastTimer = null
    }, 1200)
  } catch {
    copyToast.value = '复制失败'
  }
}
function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

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
.field input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}
.mail-actions { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 8px; }
.save-btn { height: 38px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.save-btn.compact { height: 34px; margin-top: 6px; padding: 0 18px; }
.save-btn:hover { background: var(--accent-strong); }
.save-btn:disabled { opacity: 0.6; cursor: default; }
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
  animation: reveal-in var(--dur-base) var(--ease-out);
}

@keyframes reveal-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
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
  animation: reveal-in var(--dur-base) var(--ease-out);
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
.mail-card { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); cursor: pointer; transition: background-color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.mail-card:hover { background: var(--bg-card-hover); border-color: rgba(47, 125, 120, 0.22); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
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
.detail-overlay { position: fixed; inset: 0; z-index: 1000; overflow: hidden; border-radius: var(--radius-window); background: var(--bg-overlay); clip-path: inset(0 round var(--radius-window)); display: grid; place-items: center; padding: 12px; animation: overlay-in var(--dur-base) var(--ease-out); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
.detail-panel { width: 100%; max-height: 80vh; padding: 14px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--border); box-shadow: var(--shadow-pop); overflow-y: auto; animation: panel-in var(--dur-base) var(--ease-spring); }
@keyframes panel-in { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.detail-header h3 { font-size: 15px; font-weight: 600; color: var(--text); }
.detail-meta { font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.task-detail { display: grid; gap: 10px; }
.task-brief { display: grid; gap: 8px; }
.brief-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); gap: 8px; }
.brief-item {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input);
}
.brief-item span,
.brief-notes span {
  color: var(--text-muted);
  font-size: 11px;
}
.brief-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--accent);
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brief-item.owner { grid-column: 1 / -1; }
.brief-item.owner.muted strong { color: var(--text-muted); font-weight: 600; }
.brief-notes {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border: 1px solid rgba(180, 135, 30, 0.22);
  border-radius: 8px;
  background: rgba(255, 193, 70, 0.12);
}
.brief-notes p {
  margin: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
}
.material-card {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid rgba(47, 125, 120, 0.24);
  border-radius: 10px;
  background: var(--bg-elevated);
}
.material-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.material-head span {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}
.material-head strong {
  min-width: 0;
  overflow: hidden;
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.material-fields {
  display: grid;
  margin: 0;
  border-top: 1px solid var(--border);
}
.material-fields div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 32px;
  border-bottom: 1px solid var(--border);
}
.material-fields dt,
.material-fields dd {
  margin: 0;
  font-size: 12px;
}
.material-fields dt { color: var(--text-muted); }
.material-fields dd {
  min-width: 0;
  text-align: right;
}
.copy-value {
  max-width: 100%;
  padding: 2px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-value:not(:disabled):hover { background: var(--accent-soft); }
.copy-value.missing,
.copy-value:disabled {
  color: var(--text-muted);
  cursor: default;
  font-weight: 500;
}
.material-pager {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
  text-align: center;
}
.pager-btn {
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-input);
  color: var(--accent);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.pager-btn:disabled {
  cursor: default;
  opacity: 0.42;
}
.pager-btn:not(:disabled):hover {
  border-color: rgba(47, 125, 120, 0.35);
  background: var(--accent-soft);
}
.copy-toast {
  justify-self: center;
  margin: -2px 0 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}
.original-mail {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
}
.original-mail summary {
  cursor: pointer;
  padding: 6px 0;
  color: var(--text-muted);
}
.original-mail[open] summary { margin-bottom: 8px; }
.detail-body { font-size: 12px; color: var(--text); line-height: 1.6; margin-bottom: 10px; white-space: pre-wrap; }
.html-body {
  max-width: 100%;
  overflow: auto;
  white-space: normal;
}
.html-body :deep(table) {
  min-width: 680px;
  max-width: none;
  border-collapse: collapse;
  background: var(--bg-elevated);
}
.html-body :deep(td),
.html-body :deep(th) {
  padding: 4px 6px;
  border: 1px solid rgba(94, 112, 108, 0.35);
  color: var(--text);
  font-size: 11px;
  line-height: 1.35;
  vertical-align: top;
  white-space: nowrap;
}
.html-body :deep(p),
.html-body :deep(div) {
  margin: 0 0 8px;
}
.html-body :deep(a) {
  color: var(--accent);
}
.extract-table { width: 100%; border-collapse: collapse; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.extract-table td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid var(--border); }
.extract-table td:first-child { color: var(--text-muted); }
.extract-table td:last-child { text-align: right; font-weight: 600; color: var(--accent); cursor: pointer; }
.extract-table td:last-child:hover { background: var(--accent-soft); }
.extract-table tr:last-child td { border-bottom: none; }

/* ===== 附件控制 ===== */
.attachment-bar { margin-top: 10px; display: flex; gap: 6px; }
.attach-btn {
  flex: 1; height: 32px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg-input); color: var(--text-muted); font-size: 11px; cursor: pointer;
  font-family: inherit; transition: border-color 0.15s;
}
.attach-btn:hover { border-color: var(--accent); color: var(--accent); }
.attach-btn.back { color: var(--accent); border-color: rgba(47,125,120,0.2); background: var(--accent-soft); }

/* ===== 附件选择器 ===== */
.picker-overlay {
  position: fixed; inset: 0; z-index: 1100;
  background: var(--bg-overlay); display: grid; place-items: center; padding: 20px;
}
.picker-list {
  width: min(100%, 260px); padding: 12px;
  border-radius: 12px; background: var(--bg-elevated);
  border: 1px solid var(--border); box-shadow: var(--shadow);
  display: grid; gap: 4px;
}
.picker-title {
  font-size: 13px; font-weight: 600; color: var(--text);
  padding-bottom: 6px; margin-bottom: 4px; border-bottom: 1px solid var(--border);
}
.picker-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 8px 10px; border: none; border-radius: 8px;
  background: transparent; color: var(--text); font-size: 12px; cursor: pointer;
  font-family: inherit; text-align: left;
}
.picker-item:hover { background: var(--accent-soft); color: var(--accent); }
.picker-item.muted { color: var(--text-muted); justify-content: center; }
.picker-size { font-size: 10px; color: var(--text-muted); }
</style>
