<template>
  <section class="mail-panel">
    <!-- 未配置 -->
    <div v-if="!store.configured" class="login-area">
      <div class="login-card">
        <div class="login-icon"><Mail :size="22" /></div>
        <h3>连接公司邮箱</h3>
        <p>Exchange 账户登录后可自动拉取出货单邮件</p>
        <form @submit.prevent="handleConfig" class="mail-form">
          <label class="field"><span>Exchange 服务器</span><input type="text" v-model="form.server" placeholder="mail.lingyiitech.com" required @input="scheduleSaveMailIdentity"></label>
          <label class="field"><span>邮箱地址</span><input type="text" v-model="form.email" placeholder="zhang.wei@company.com" required @input="scheduleSaveMailIdentity"></label>
          <div class="field-row">
            <label class="field"><span>AD 域</span><input type="text" v-model="form.domain" placeholder="LSTECH" required @input="scheduleSaveMailIdentity"></label>
            <label class="field"><span>AD 账号</span><input type="text" v-model="form.domainUser" placeholder="zhang.wei" required @input="scheduleSaveMailIdentity"></label>
          </div>
          <label class="field"><span>密码</span><input v-model="form.password" type="password" placeholder="邮箱密码" required></label>
          <div class="mail-actions">
            <button type="submit" class="btn-primary" :disabled="connecting">{{ connecting ? '连接中...' : '连接邮箱' }}</button>
            <button type="button" class="btn-secondary" :disabled="store.doctorRunning" @click="handleDoctor">
              {{ store.doctorRunning ? '诊断中' : '诊断' }}
            </button>
          </div>
          <div class="doctor-card" v-if="store.doctorResult">
            <div class="doctor-title">
              <span :class="['status-dot', store.doctorResult.ok ? 'on' : 'off']"></span>
              <strong>{{ store.doctorResult.ok ? '配置已就绪' : '配置待修复' }}</strong>
            </div>
            <dl>
              <div><dt>依赖</dt><dd>{{ store.doctorResult.dependency?.exchangelib ? '正常' : (store.doctorResult.dependency?.error || '异常') }}</dd></div>
              <div><dt>服务器</dt><dd>{{ store.doctorResult.config?.server || form.server || DEFAULT_MAIL_SERVER }}</dd></div>
              <div><dt>DNS</dt><dd>{{ store.doctorResult.network?.dns ? (store.doctorResult.network?.address || '正常') : '未通' }}</dd></div>
              <div><dt>端口</dt><dd>{{ store.doctorResult.network?.tcp ? `443 已通` : '443 未通' }}</dd></div>
              <div><dt>EWS 认证</dt><dd>{{ doctorEwsText }}</dd></div>
              <div><dt>AD 域</dt><dd>{{ store.doctorResult.config?.domain || form.domain || DEFAULT_MAIL_DOMAIN }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ store.doctorResult.config?.smtp_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>账号</dt><dd>{{ store.doctorResult.config?.domain_user_present ? '已填写' : '未填写' }}</dd></div>
              <div><dt>密码</dt><dd>{{ store.doctorResult.config?.password_present ? '已填写' : '未填写' }}</dd></div>
            </dl>
            <div v-if="store.doctorResult.fixes?.length" class="doctor-fixes">
              <p v-for="fix in store.doctorResult.fixes" :key="fix.action">{{ fix.label }}</p>
            </div>
            <div class="doctor-actions">
              <button type="button" class="btn-secondary" :disabled="fixing" @click="handleFix('reconnect')">重新连接</button>
              <button type="button" class="btn-secondary" :disabled="fixing" @click="handleFix('restart')">重启服务</button>
            </div>
            <p v-if="fixResult" class="fix-result" :class="{ error: fixError }">{{ fixResult }}</p>
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
        <div class="segmented" role="group" aria-label="邮件筛选">
          <button class="seg-item" :data-active="mailFilter === 'all'" type="button" @click="mailFilter = 'all'">全部</button>
          <button class="seg-item" :data-active="mailFilter === 'unread'" type="button" @click="mailFilter = 'unread'">未读</button>
        </div>
        <div class="mail-toolbar-actions">
          <button class="icon-btn" title="拉取" type="button" @click="handleFetch"><RefreshCw :size="16" /></button>
          <button class="icon-btn" title="断开" type="button" @click="handleStop"><Power :size="16" /></button>
        </div>
      </div>
      <div class="mail-list" v-if="displayMails.length">
        <div
          v-for="mail in displayMails"
          :key="mail.id"
          class="mail-card"
          :class="{ unread: !mail.is_read }"
          @click="store.openDetail(mail.id)"
        >
          <div class="mail-head">
            <strong>{{ mail.subject }}</strong>
            <time>{{ relativeTime(mail.received_at) }}</time>
          </div>
          <div class="mail-from">{{ mail.sender }}</div>
          <div class="mail-preview">{{ (mail.body || '').slice(0, 100) }}</div>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon"><Mail :size="28" /></span>
        <p class="empty-title">还没有拉取到邮件</p>
        <small>保持公司网络连接后刷新，系统会读取最近的收件箱邮件。</small>
        <button class="btn-primary" style="height: 34px; margin-top: 6px" @click="handleFetch">立即刷新</button>
      </div>
    </div>

    <!-- 详情 -->
    <div v-if="store.selectedMail" class="detail-overlay" @click.self="store.closeDetail()">
      <div class="detail-panel">
        <div class="detail-header"><h3>{{ displaySummary?.title || store.selectedMail?.subject || '加载中…' }}</h3><button class="icon-btn" @click="store.closeDetail()"><X :size="18" /></button></div>
        <div v-if="store.selectedMail.sender" class="detail-meta"><span>{{ store.selectedMail.sender }}</span><span>{{ relativeTime(store.selectedMail.received_at) }}</span></div>

        <!-- 无任何缓存/预览：后台拉取中 -->
        <div v-if="store.selectedMail.loading && !store.selectedMail.body" class="excel-loading"><span class="spinner" aria-hidden="true"></span>加载中...</div>

        <!-- Excel 加载中 -->
        <div v-else-if="excelLoading" class="excel-loading"><span class="spinner" aria-hidden="true"></span>解析附件中...</div>

        <!-- 任务卡片（正文 或 Excel 共用）；预览占位阶段不解析摘要 -->
        <div v-else-if="displaySummary && !store.selectedMail.loading" class="task-detail">
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
import { relativeTime } from '../lib/format'

const store = useMailStore()
const DEFAULT_MAIL_DOMAIN = 'LSTECH'
const DEFAULT_MAIL_SERVER = 'mail.lingyiitech.com'
const form = ref({ server: DEFAULT_MAIL_SERVER, email: '', domainUser: '', domain: DEFAULT_MAIL_DOMAIN, password: '' })
const connecting = ref(false)
const materialPage = ref(0)
const copyToast = ref('')
const mailFilter = ref('all')
const fixing = ref(false)
const fixResult = ref('')
const fixError = ref(false)
let fixResultTimer = null
const displayMails = computed(() => {
  if (mailFilter.value === 'unread') return store.mails.filter((mail) => !mail.is_read)
  return store.mails
})
let saveIdentityTimer = null
let copyToastTimer = null

const doctorEwsText = computed(() => {
  const ews = store.doctorResult?.ews
  if (!ews) return '未测试'
  return ews.ok ? '已通过' : '失败'
})

// DOMPurify 异步清洗：大 HTML 同步清洗会卡住弹层首帧，延迟到下一帧执行
const sanitizedMailHtml = ref('')
let sanitizeTimer = null
watch(() => store.selectedMail?.html, (raw) => {
  if (sanitizeTimer) clearTimeout(sanitizeTimer)
  sanitizedMailHtml.value = ''
  if (!raw || !/<[a-z][\s\S]*>/i.test(raw)) return
  sanitizeTimer = setTimeout(() => {
    sanitizedMailHtml.value = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'a', 'b', 'br', 'blockquote', 'body', 'caption', 'col', 'colgroup', 'div', 'em',
        'font', 'h1', 'h2', 'h3', 'h4', 'hr', 'html', 'i', 'li', 'ol', 'p', 'pre',
        'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
      ],
      ALLOWED_ATTR: ['align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'colspan', 'href', 'rowspan', 'style', 'target', 'valign', 'width'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    })
  }, 0)
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

watch(displayMaterialPage, () => {
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
async function handleFix(action) {
  fixing.value = true
  fixError.value = false
  fixResult.value = ''
  try {
    const result = await store.fix(action)
    if (result?.ok) {
      fixResult.value = action === 'reconnect' ? '已重新连接 Exchange' : '邮件服务已重启'
    } else {
      fixError.value = true
      fixResult.value = result?.error || '修复失败'
    }
  } catch (err) {
    fixError.value = true
    fixResult.value = err?.message || '修复失败'
  } finally {
    fixing.value = false
    if (fixResultTimer) clearTimeout(fixResultTimer)
    fixResultTimer = setTimeout(() => {
      fixResult.value = ''
      fixError.value = false
    }, 4000)
  }
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
  if (fixResultTimer) clearTimeout(fixResultTimer)
  if (sanitizeTimer) clearTimeout(sanitizeTimer)
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

</script>

<style scoped>
.mail-panel {
  min-width: 0;
}

/* ===== 登录区 ===== */
.login-area {
  padding: 4px 0;
}

.login-card {
  padding: 24px 18px 20px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-card);
  box-shadow: var(--shadow-xs);
  text-align: center;
}

.login-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--apple-radius-lg);
  background: var(--brand-soft);
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--apple-primary);
}

.login-card h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--apple-foreground);
}

.login-card > p {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--apple-muted-foreground);
  line-height: 1.45;
}

.mail-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(78px, 0.8fr) minmax(0, 1.2fr);
  gap: 10px;
}

.mail-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 8px;
}

.mail-actions .btn-primary,
.mail-actions .btn-secondary {
  height: 38px;
}

.mail-actions .btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.login-help {
  margin: 14px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--apple-muted-foreground);
}

.doctor-card {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-background);
  animation: rise var(--dur-base) var(--ease-out);
}

.doctor-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--apple-foreground);
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
  color: var(--apple-muted-foreground);
}

.doctor-card dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doctor-card p {
  margin: 0;
  color: var(--apple-destructive);
  font-size: 10px;
  line-height: 1.4;
}

.doctor-fixes {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
}

.doctor-fixes p {
  color: var(--apple-foreground);
}

.doctor-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.doctor-actions .btn-secondary {
  height: 30px;
  font-size: 11px;
}

.fix-result {
  text-align: center;
  color: var(--apple-primary) !important;
  font-weight: 600;
}

.fix-result.error {
  color: var(--apple-destructive) !important;
  font-weight: 500;
}

.mail-error-card {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--apple-destructive) 28%, transparent);
  border-radius: var(--apple-radius-md);
  background: var(--state-error-surface);
  color: var(--apple-foreground);
  animation: rise var(--dur-base) var(--ease-out);
}

.mail-error-title {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--apple-destructive);
  font-size: 12px;
  font-weight: 700;
}

.mail-error-card p {
  margin: 0;
  color: var(--apple-foreground);
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
  color: var(--apple-muted-foreground);
}

.mail-error-card dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--apple-muted-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 已连接 ===== */
.mail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 2px 0 14px;
}

.mail-toolbar .segmented {
  flex: 1;
}

.mail-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.mail-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mail-card {
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-card);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    border-color 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out),
    transform 0.15s var(--ease-out);
}

.mail-card:active {
  transform: scale(0.99);
}

.mail-card.unread {
  border-left: 2px solid var(--apple-primary);
}

.mail-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
}

.mail-head strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-head time {
  flex: none;
  font-size: 10px;
  color: var(--apple-muted-foreground);
}

.mail-from {
  margin-bottom: 2px;
  font-size: 11px;
  color: var(--apple-primary);
}

.mail-preview {
  font-size: 11px;
  line-height: 16px;
  color: var(--apple-muted-foreground);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.empty-state small {
  color: var(--apple-muted-foreground);
  font-size: 11px;
  line-height: 1.45;
}

/* ===== 详情弹层 ===== */
.excel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--apple-muted-foreground);
  font-size: 12px;
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--brand-soft);
  border-top-color: var(--apple-primary);
  animation: spin 0.8s linear infinite;
}

.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 12px;
  background: color-mix(in srgb, var(--apple-foreground) 35%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  clip-path: inset(0 round var(--radius-window));
  animation: fade var(--dur-base) var(--ease-out);
}

.detail-panel {
  width: 100%;
  max-height: 80vh;
  padding: 14px;
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  box-shadow: var(--shadow-xl);
  overflow-y: auto;
  animation: rise var(--dur-base) var(--ease-spring);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.detail-header h3 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  color: var(--apple-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--apple-border);
  font-size: 11px;
  color: var(--apple-muted-foreground);
}

.task-detail {
  display: grid;
  gap: 10px;
}

.task-brief {
  display: grid;
  gap: 8px;
}

.brief-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  gap: 8px;
}

.brief-item {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-md);
  background: var(--apple-background);
}

.brief-item span,
.brief-notes span {
  color: var(--apple-muted-foreground);
  font-size: 11px;
}

.brief-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-primary);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brief-item.owner {
  grid-column: 1 / -1;
}

.brief-item.owner.muted strong {
  color: var(--apple-muted-foreground);
  font-weight: 600;
}

.brief-notes {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border: 1px solid var(--warning-soft);
  border-radius: var(--apple-radius-md);
  background: var(--warning-soft);
}

.brief-notes p {
  margin: 0;
  color: var(--apple-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.material-card {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--border-brand);
  border-radius: var(--apple-radius-md);
  background: var(--apple-card);
}

.material-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.material-head span {
  color: var(--apple-foreground);
  font-size: 13px;
  font-weight: 700;
}

.material-head strong {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-primary);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-fields {
  display: grid;
  margin: 0;
  border-top: 1px solid var(--apple-border);
}

.material-fields div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 32px;
  border-bottom: 1px solid var(--apple-border);
}

.material-fields dt,
.material-fields dd {
  margin: 0;
  font-size: 12px;
}

.material-fields dt {
  color: var(--apple-muted-foreground);
}

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
  color: var(--apple-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-value.missing,
.copy-value:disabled {
  color: var(--apple-muted-foreground);
  cursor: default;
  font-weight: 500;
}

.material-pager {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  align-items: center;
  gap: 8px;
  color: var(--apple-muted-foreground);
  font-size: 11px;
  text-align: center;
}

.pager-btn {
  height: 28px;
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-sm);
  background: var(--apple-background);
  color: var(--apple-primary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.pager-btn:disabled {
  cursor: default;
  opacity: 0.42;
}

.copy-toast {
  justify-self: center;
  margin: -2px 0 0;
  padding: 4px 8px;
  border-radius: var(--radius-full);
  background: var(--brand-soft);
  color: var(--apple-primary);
  font-size: 11px;
  font-weight: 700;
}

.original-mail {
  margin-top: 2px;
  font-size: 11px;
}

.original-mail summary {
  cursor: pointer;
  padding: 6px 0;
  color: var(--apple-muted-foreground);
}

.original-mail[open] summary {
  margin-bottom: 8px;
}

.detail-body {
  font-size: 12px;
  color: var(--apple-foreground);
  line-height: 1.6;
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.html-body {
  max-width: 100%;
  overflow: auto;
  white-space: normal;
}

.html-body :deep(table) {
  min-width: 680px;
  max-width: none;
  border-collapse: collapse;
  background: var(--apple-card);
}

.html-body :deep(td),
.html-body :deep(th) {
  padding: 4px 6px;
  border: 1px solid rgba(94, 112, 108, 0.35);
  color: var(--apple-foreground);
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
  color: var(--apple-primary);
}

.extract-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.extract-table td {
  padding: 6px 8px;
  font-size: 11px;
  border-bottom: 1px solid var(--apple-border);
}

.extract-table td:first-child {
  color: var(--apple-muted-foreground);
}

.extract-table td:last-child {
  text-align: right;
  font-weight: 600;
  color: var(--apple-primary);
  cursor: pointer;
}

.extract-table tr:last-child td {
  border-bottom: none;
}

/* ===== 附件控制 ===== */
.attachment-bar {
  margin-top: 10px;
  display: flex;
  gap: 6px;
}

.attach-btn {
  flex: 1;
  height: 32px;
  border: 1px solid var(--apple-border);
  border-radius: var(--radius-full);
  background: var(--apple-background);
  color: var(--apple-muted-foreground);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}

.attach-btn.back {
  color: var(--apple-primary);
  border-color: var(--border-brand);
  background: var(--brand-soft);
}

/* ===== 附件选择器 ===== */
.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--apple-foreground) 35%, transparent);
  clip-path: inset(0 round var(--radius-window));
}

.picker-list {
  width: min(100%, 260px);
  padding: 12px;
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  box-shadow: var(--shadow-xl);
  display: grid;
  gap: 4px;
  animation: pop var(--dur-base) var(--ease-spring);
}

.picker-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-foreground);
  padding-bottom: 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--apple-border);
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--apple-foreground);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.picker-item.muted {
  color: var(--apple-muted-foreground);
  justify-content: center;
}

.picker-size {
  font-size: 10px;
  color: var(--apple-muted-foreground);
}
</style>

@media (hover: hover) and (pointer: fine) {
  .mail-card:hover {
    border-color: var(--apple-accent);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  .copy-value:not(:disabled):hover {
    background: var(--brand-soft);
  }

  .pager-btn:not(:disabled):hover {
    border-color: var(--border-brand);
    background: var(--brand-soft);
  }

  .extract-table td:last-child:hover {
    background: var(--brand-soft);
  }

  .attach-btn:hover {
    border-color: var(--apple-ring);
    color: var(--apple-primary);
  }

  .picker-item:hover {
    background: var(--brand-soft);
    color: var(--apple-primary);
  }
}
