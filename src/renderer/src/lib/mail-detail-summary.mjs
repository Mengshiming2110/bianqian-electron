// ===== 动态表头提取：表头有什么列就用什么列 =====

const QUANTITY_HEADER_PATTERN = /(数量|qty|quantity|出货数量|发货数量)/i

const NOTE_KEYWORDS = [
  '注意', '请', '需', '需要', '务必', '记得',
  '备用', '外箱', '标签', 'BU', '盖章', '打印', '包装',
  '送货单', '随货', '系统', '名称'
]

const REPLY_NOISE_PATTERNS = [
  /^发件人[:：]/i, /^发送时间[:：]/i, /^收件人[:：]/i,
  /^抄送[:：]/i, /^主题[:：]/i,
  /^from[:：]/i, /^sent[:：]/i, /^to[:：]/i, /^cc[:：]/i, /^subject[:：]/i,
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^此致$/, /^谢谢$/, /^thanks[,.! ]*$/i, /^best regards[,.! ]*$/i
]

// ===== 主入口 =====

export function buildMailTaskSummary(mail, html) {
  const tableSource = html || mail?.html || mail?.body || ''
  const table = parseShipmentTable(tableSource)
  if (!table.rows.length) return null

  const bodyText = buildBodyText(mail, tableSource)
  const summary = buildTableSummary(mail, table, bodyText)
  return summary
}

// ===== 表格解析 =====

export function parseShipmentTable(html) {
  if (typeof DOMParser === 'undefined' || !html) {
    return { headers: [], rows: [] }
  }
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  const tables = Array.from(doc.querySelectorAll('table'))
  for (const table of tables) {
    const parsed = parseTable(table)
    if (parsed.headers.length && parsed.rows.length) {
      return parsed
    }
  }
  return { headers: [], rows: [] }
}

function parseTable(table) {
  const matrix = Array.from(table.querySelectorAll('tr'))
    .map((tr) => Array.from(tr.querySelectorAll('th,td')).map((cell) => cleanCell(cell.textContent)))
    .filter((row) => row.some(Boolean))
  if (!matrix.length) return { headers: [], rows: [] }

  const explicitHeaderIndex = matrix.findIndex((_row, index) => {
    const tr = table.querySelectorAll('tr')[index]
    return tr && tr.querySelectorAll('th').length > 0
  })
  const headerIndex = explicitHeaderIndex >= 0 ? explicitHeaderIndex : 0
  const headers = matrix[headerIndex].map((h) => cleanCell(h))
  const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => cleanCell(cell)))
  return { headers, rows }
}

// ===== 动态物料构建 =====

export function buildMaterial(row, headers, index, total) {
  const fields = headers.map((header, colIdx) => {
    const rawValue = cleanCell(row[colIdx] || '')
    const isQuantity = QUANTITY_HEADER_PATTERN.test(header)
    const copyValue = isQuantity ? normalizeQuantityCopyValue(rawValue) : rawValue
    return makeCopyField(
      slugify(header),
      header,
      copyValue,
      rawValue || '--'
    )
  })

  return {
    index,
    title: pickMaterialTitle(row, headers, index),
    total,
    fields
  }
}

function pickMaterialTitle(row, headers, index) {
  // 取第一个非空单元格的值作为标题
  for (let i = 0; i < headers.length; i++) {
    const val = cleanCell(row[i] || '')
    if (val) return val
  }
  return `第 ${index} 款`
}

export function makeCopyField(key, label, copyValue, displayValue = copyValue) {
  const normalized = compactText(copyValue)
  return {
    key,
    label,
    value: displayValue ? compactText(displayValue) : '',
    copyValue: normalized,
    copyable: Boolean(normalized),
    missing: !normalized
  }
}

// ===== 数量归一化 =====

export function normalizeQuantityCopyValue(value) {
  const text = compactText(value)
  if (!text) return ''
  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/)
  return match ? match[0].replace(/,/g, '') : text
}

// ===== 文本提取（正文中提取客户/日期/负责人等概要信息） =====

export function extractSpecialNotes(text) {
  const clean = stripReplyNoise(stripHtml(text || ''))
  const seen = new Set()
  const notes = []
  const parts = clean.split(/[\r\n。；;!?！？]+/).map((p) => compactText(p)).filter(Boolean)
  for (const part of parts) {
    if (notes.length >= 5) break
    if (looksLikeTableRow(part)) continue
    if (REPLY_NOISE_PATTERNS.some((re) => re.test(part))) continue
    if (!NOTE_KEYWORDS.some((kw) => part.includes(kw))) continue
    const note = part.length > 80 ? `${part.slice(0, 77)}...` : part
    if (!seen.has(note)) { seen.add(note); notes.push(note) }
  }
  return notes
}

export function firstDate(text) {
  const clean = compactText(text)
  if (!clean) return ''
  const patterns = [
    /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/,
    /(\d{1,2})[-/.月](\d{1,2})日?/
  ]
  for (const re of patterns) {
    const m = clean.match(re)
    if (!m) continue
    const hasYear = m.length === 4
    const year = hasYear ? Number(m[1]) : new Date().getFullYear()
    const month = Number(hasYear ? m[2] : m[1])
    const day = Number(hasYear ? m[3] : m[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`
    }
  }
  return ''
}

export function extractByLabel(text, labels) {
  const clean = stripReplyNoise(stripHtml(text || ''))
  for (const label of labels) {
    const escaped = escapeRegExp(label)
    const m = clean.match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\n\\r；;，,。]+)`, 'i'))
    if (m) return compactText(m[1])
  }
  return ''
}

// ===== 工具函数 =====

export function cleanCell(value) {
  return compactText(stripHtml(value || '')).replace(/^[:：]+|[:：]+$/g, '')
}

export function compactText(value) {
  return String(value ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(?:p|div|tr|li|br|table|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
}

export function stripReplyNoise(value) {
  const lines = String(value ?? '').split(/\r?\n/).map((l) => compactText(l)).filter(Boolean)
  const kept = []
  for (const line of lines) {
    if (/^[-_]{2,}$/.test(line)) continue
    if (/^={2,}$/.test(line)) continue
    if (REPLY_NOISE_PATTERNS.some((re) => re.test(line))) break
    kept.push(line)
  }
  return kept.join('\n')
}

function looksLikeTableRow(value) {
  const text = compactText(value)
  if (!text) return false
  const separators = (text.match(/\s{2,}|\t|\|/g) || []).length
  return separators >= 3
}

export function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function slugify(value) {
  return compactText(value).replace(/[\s/_-]+/g, '-').toLowerCase() || 'col'
}

function pad2(v) { return String(v).padStart(2, '0') }

// ===== 内部构建 =====

function buildBodyText(mail, tableSource) {
  const parts = [mail?.body, stripHtml(tableSource)].map((p) => compactText(stripHtml(p || ''))).filter(Boolean)
  return stripReplyNoise([...new Set(parts)].join('\n'))
}

function buildTableSummary(mail, table, bodyText) {
  const text = [mail?.subject, bodyText].filter(Boolean).join('\n')
  const materials = table.rows.map((row, i) => buildMaterial(row, table.headers, i + 1, table.rows.length))

  // 概要：从正文提取客户 / 日期 / 负责人
  const customer = extractByLabel(bodyText, ['出货客户', '客户']) || '--'
  const rawDate = extractByLabel(bodyText, ['出货时间', '发货日期', '送货日期', '交货日期'])
  const shipmentDate = firstDate(rawDate) || firstDate(bodyText) || '--'
  const salesOwner = extractByLabel(bodyText, ['销售负责人', '业务负责人', '负责人', '销售', 'PM']) || '负责人待确认'

  return {
    title: pickSummaryTitle(bodyText, materials),
    brief: {
      customer,
      shipmentDate,
      salesOwner,
      salesOwnerMissing: salesOwner === '负责人待确认',
      notes: extractSpecialNotes(bodyText)
    },
    materials,
    rawMessage: buildSummaryMessage(text, materials.length)
  }
}

function pickSummaryTitle(bodyText, materials) {
  const orderNo = extractOrderNo(bodyText)
  if (orderNo) return `出货任务 ${orderNo}`
  if (materials.length > 0) return `出货任务（${materials.length} 款）`
  return '出货任务'
}

function extractOrderNo(text) {
  const clean = compactText(text)
  const labelled = extractByLabel(clean, ['订单号', '订单编号', '出货单号', '出货任务单', 'Order No', 'OrderNo', 'PO', 'SO'])
  if (labelled) return labelled
  const m = clean.match(/\b(?:SO|PO|DN|DO|NO)[-_\s:]?([A-Z0-9-]{4,})\b/i)
  return m ? compactText(m[0]) : ''
}

function buildSummaryMessage(text, count) {
  const clean = compactText(stripReplyNoise(stripHtml(text || '')))
  const prefix = count > 0 ? `识别到 ${count} 条物料` : '未识别到物料明细'
  return clean ? `${prefix}。${clean.slice(0, 160)}` : prefix
}

// ===== Excel 附件解析 =====

import * as XLSX from 'xlsx'

export function buildExcelTaskSummary(buffer, fileName) {
  if (!buffer) return null
  try {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return null
    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (!matrix.length) return null

    const headerRow = matrix[0].map((h) => cleanCell(String(h)))
    const dataRows = matrix.slice(1).filter((row) => row.some((cell) => String(cell || '').trim()))

    const materials = dataRows.map((row, i) =>
      buildMaterial(row.map((c) => String(c ?? '')), headerRow, i + 1, dataRows.length)
    )

    return {
      title: fileName ? `附件: ${fileName}` : 'Excel 附件',
      source: 'excel',
      brief: {
        customer: '--',
        shipmentDate: '--',
        salesOwner: '--',
        salesOwnerMissing: true,
        notes: []
      },
      materials,
      rawMessage: `从 ${fileName || 'Excel 附件'} 提取，共 ${materials.length} 行数据`
    }
  } catch (err) {
    console.error('[excel] 解析失败:', err?.message || String(err))
    return null
  }
}

