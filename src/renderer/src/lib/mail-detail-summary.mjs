export const MATERIAL_FIELD_KEYS = ['apn', 'oemPn', 'lyPn', 'quantity', 'config', 'remark']

const MATERIAL_FIELDS = [
  { key: 'apn', label: 'APN', keywords: ['APN', '物料编码', '物料号'] },
  { key: 'oemPn', label: 'OEM PN', keywords: ['OEM PN', 'OEMPN', 'OEM P/N', 'OEM料号', '客户料号'] },
  { key: 'lyPn', label: 'LY PN', keywords: ['LY PN', 'LYPN', 'LY P/N', '凌翼料号', '领益料号', '内部料号'] },
  { key: 'quantity', label: '数量', keywords: ['数量', 'QTY', 'Qty', '出货数量', '发货数量'] },
  { key: 'config', label: 'Config', keywords: ['Config', 'CONFIG', '配置', '版本'] },
  { key: 'remark', label: '备注', keywords: ['备注', 'Remark', 'REMARK', '说明', '要求'] }
]

const CUSTOMER_LABELS = ['出货客户', '客户']
const DATE_LABELS = ['出货时间', '发货日期', '送货日期', '交货日期']
const SALES_OWNER_LABELS = ['销售负责人', '业务负责人', '负责人', '销售', 'PM']
const ORDER_LABELS = ['订单号', '订单编号', '出货单号', '出货任务单', 'Order No', 'OrderNo', 'PO', 'SO']
const NOTE_KEYWORDS = [
  '注意',
  '请',
  '需',
  '需要',
  '务必',
  '记得',
  '备用',
  '外箱',
  '标签',
  'BU',
  '盖章',
  '打印',
  '包装',
  '送货单',
  '随货',
  '系统',
  '名称'
]
const EXACT_ONLY_HEADER_ALIASES = new Set(['客户'])
const REPLY_NOISE_PATTERNS = [
  /^发件人[:：]/i,
  /^发送时间[:：]/i,
  /^收件人[:：]/i,
  /^抄送[:：]/i,
  /^主题[:：]/i,
  /^from[:：]/i,
  /^sent[:：]/i,
  /^to[:：]/i,
  /^cc[:：]/i,
  /^subject[:：]/i,
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^此致$/,
  /^谢谢$/,
  /^thanks[,.! ]*$/i,
  /^best regards[,.! ]*$/i
]

export function buildMailTaskSummary(mail, html) {
  const tableSource = html || mail?.html || mail?.body || ''
  const table = parseShipmentTable(tableSource)
  const textParts = [mail?.body, stripHtml(tableSource)].map((part) => compactText(stripHtml(part || ''))).filter(Boolean)
  const bodyText = stripReplyNoise([...new Set(textParts)].join('\n'))
  const hasRecognizedTable = Boolean(table.rows.length && isRecognizedShipmentTable(table.headers))

  if (!hasRecognizedTable) return null

  return buildTableSummary(mail, table, bodyText)
}

export function buildMaterial(row, headers, index, total) {
  const fields = []

  for (const field of MATERIAL_FIELDS) {
    const headerIndex = findHeaderIndex(headers, field.keywords)
    const rawValue = headerIndex >= 0 ? cleanCell(row[headerIndex]) : ''
    const copyValue = field.key === 'quantity' ? normalizeQuantityCopyValue(rawValue) : rawValue
    fields.push(
      rawValue
        ? makeCopyField(field.key, field.label, copyValue, rawValue)
        : {
            ...makeCopyField(field.key, field.label, '', '待确认'),
            copyable: false,
            missing: true
          }
    )
  }

  return {
    index,
    title: buildMaterialTitle(fields, index),
    total,
    fields
  }
}

function buildMaterialTitle(fields, index) {
  const valueFor = (key) => fields.find((field) => field.key === key && !field.missing)?.value || ''
  return valueFor('apn') || valueFor('lyPn') || valueFor('oemPn') || `第 ${index} 款`
}

export function makeCopyField(key, label, copyValue, displayValue = copyValue) {
  const normalizedCopyValue = compactText(copyValue)

  return {
    key,
    label,
    value: displayValue ? compactText(displayValue) : '',
    copyValue: normalizedCopyValue,
    copyable: Boolean(normalizedCopyValue),
    missing: false
  }
}

export function parseShipmentTable(html) {
  if (typeof DOMParser === 'undefined' || !html) {
    return { headers: [], rows: [] }
  }

  const document = new DOMParser().parseFromString(String(html), 'text/html')
  const tables = Array.from(document.querySelectorAll('table'))

  for (const table of tables) {
    const parsed = parseTable(table)
    if (parsed.rows.length && isRecognizedShipmentTable(parsed.headers)) {
      return parsed
    }
  }

  return { headers: [], rows: [] }
}

export function extractSalesOwner(rows, headers, bodyText) {
  const tableIndex = findHeaderIndex(headers, SALES_OWNER_LABELS)
  const tableValue = tableIndex >= 0 ? firstValue(rows.map((row) => row[tableIndex])) : ''

  return tableValue || extractByLabel(bodyText, SALES_OWNER_LABELS)
}

export function extractSpecialNotes(text) {
  const cleanText = stripReplyNoise(stripHtml(text || ''))
  const seen = new Set()
  const notes = []
  const parts = cleanText
    .split(/[\r\n。；;!?！？]+/)
    .map((part) => compactText(part))
    .filter(Boolean)

  for (const part of parts) {
    if (notes.length >= 3) break
    if (looksLikeTableRow(part)) continue
    if (REPLY_NOISE_PATTERNS.some((pattern) => pattern.test(part))) continue
    if (!NOTE_KEYWORDS.some((keyword) => part.includes(keyword))) continue

    const note = part.length > 80 ? `${part.slice(0, 77)}...` : part
    if (!seen.has(note)) {
      seen.add(note)
      notes.push(note)
    }
  }

  return notes
}

export function normalizeQuantityCopyValue(value) {
  const text = compactText(value)
  if (!text) return ''

  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/)
  return match ? match[0].replace(/,/g, '') : text
}

export function findHeaderIndex(headers, keywords) {
  const normalizedKeywords = keywords.map((keyword) => normalizeHeader(keyword))

  const exactIndex = headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header)
    return normalizedKeywords.some((keyword) => normalizedHeader === keyword)
  })
  if (exactIndex >= 0) return exactIndex

  return headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header)
    return normalizedKeywords.some((keyword) => {
      if (EXACT_ONLY_HEADER_ALIASES.has(keyword)) return false
      return normalizedHeader.includes(keyword)
    })
  })
}

export function extractByLabel(text, labels) {
  const cleanText = stripReplyNoise(stripHtml(text || ''))

  for (const label of labels) {
    const escaped = escapeRegExp(label)
    const match = cleanText.match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\n\\r；;，,。]+)`, 'i'))
    if (match) {
      return compactText(match[1])
    }
  }

  return ''
}

export function firstDate(text) {
  const cleanText = compactText(text)
  if (!cleanText) return ''

  const patterns = [
    /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/,
    /(\d{1,2})[-/.月](\d{1,2})日?/
  ]

  for (const pattern of patterns) {
    const match = cleanText.match(pattern)
    if (!match) continue

    const hasYear = match.length === 4
    const year = hasYear ? Number(match[1]) : new Date().getFullYear()
    const month = Number(hasYear ? match[2] : match[1])
    const day = Number(hasYear ? match[3] : match[2])

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${padDatePart(month)}-${padDatePart(day)}`
    }
  }

  return ''
}

export function extractOrderNo(text) {
  const cleanText = compactText(text)
  const labelled = extractByLabel(cleanText, ORDER_LABELS)
  if (labelled) return labelled

  const match = cleanText.match(/\b(?:SO|PO|DN|DO|NO)[-_\s:]?([A-Z0-9-]{4,})\b/i)
  return match ? compactText(match[0]) : ''
}

export function buildSummaryMessage(text, materialCount) {
  const cleanText = compactText(stripReplyNoise(stripHtml(text || '')))
  const prefix = materialCount > 0 ? `识别到 ${materialCount} 条物料` : '未识别到物料明细'

  if (!cleanText) return prefix
  return `${prefix}。${cleanText.slice(0, 160)}`
}

export function firstValue(values) {
  for (const value of values) {
    const cleanValue = cleanCell(value)
    if (cleanValue) return cleanValue
  }

  return ''
}

export function normalizeHeader(value) {
  return compactText(value).replace(/[\s/_-]+/g, '').toLowerCase()
}

export function cleanCell(value) {
  return compactText(stripHtml(value || '')).replace(/^[:：]+|[:：]+$/g, '')
}

export function compactText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(?:p|div|tr|li|br|table|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function stripReplyNoise(value) {
  const lines = String(value ?? '')
    .split(/\r?\n/)
    .map((line) => compactText(line))
    .filter(Boolean)
  const kept = []

  for (const line of lines) {
    if (/^[-_]{2,}$/.test(line)) continue
    if (/^={2,}$/.test(line)) continue
    if (REPLY_NOISE_PATTERNS.some((pattern) => pattern.test(line))) break
    kept.push(line)
  }

  return kept.join('\n')
}

export function looksLikeTableRow(value) {
  const text = compactText(value)
  if (!text) return false

  const separators = (text.match(/\s{2,}|\t|\|/g) || []).length
  const materialHits = MATERIAL_FIELDS.filter((field) =>
    field.keywords.some((keyword) => normalizeHeader(text).includes(normalizeHeader(keyword)))
  ).length

  return separators >= 2 || materialHits >= 3
}

export function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTableSummary(mail, table, bodyText) {
  const text = [mail?.subject, bodyText].filter(Boolean).join('\n')
  const orderNo = extractOrderNo(text)
  const customer = extractTableOrBodyValue(table.rows, table.headers, CUSTOMER_LABELS, bodyText)
  const rawShipmentDate = extractTableOrBodyValue(table.rows, table.headers, DATE_LABELS, bodyText)
  const shipmentDate = firstDate(rawShipmentDate) || firstDate(bodyText)
  const salesOwner = extractSalesOwner(table.rows, table.headers, bodyText) || '负责人待确认'
  const salesOwnerMissing = salesOwner === '负责人待确认'
  const materials = table.rows.map((row, index) => buildMaterial(row, table.headers, index + 1, table.rows.length))

  return {
    title: orderNo ? `出货任务 ${orderNo}` : '出货任务',
    brief: {
      customer: customer || '待确认',
      shipmentDate: shipmentDate || '待确认',
      salesOwner,
      salesOwnerMissing,
      notes: extractSpecialNotes(bodyText)
    },
    materials,
    rawMessage: buildSummaryMessage(text, materials.length)
  }
}

function extractTableOrBodyValue(rows, headers, labels, bodyText) {
  const tableIndex = findHeaderIndex(headers, labels)
  const tableValue = tableIndex >= 0 ? firstValue(rows.map((row) => row[tableIndex])) : ''

  return tableValue || extractByLabel(bodyText, labels)
}

function parseTable(table) {
  const matrix = Array.from(table.querySelectorAll('tr'))
    .map((tr) => Array.from(tr.querySelectorAll('th,td')).map((cell) => cleanCell(cell.textContent)))
    .filter((row) => row.some(Boolean))

  if (!matrix.length) return { headers: [], rows: [] }

  const explicitHeaderIndex = matrix.findIndex((row, index) => {
    const tr = table.querySelectorAll('tr')[index]
    return tr && tr.querySelectorAll('th').length > 0
  })
  const headerIndex = explicitHeaderIndex >= 0 ? explicitHeaderIndex : 0
  const headers = matrix[headerIndex].map((header) => cleanCell(header))
  const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => cleanCell(cell)))

  return { headers, rows }
}

function isRecognizedShipmentTable(headers) {
  const materialMatches = MATERIAL_FIELDS.filter((field) => findHeaderIndex(headers, field.keywords) >= 0).length
  const shipmentMatches = [CUSTOMER_LABELS, DATE_LABELS, SALES_OWNER_LABELS].filter(
    (labels) => findHeaderIndex(headers, labels) >= 0
  ).length

  return materialMatches >= 2 || (materialMatches >= 1 && shipmentMatches >= 1)
}

function padDatePart(value) {
  return String(value).padStart(2, '0')
}
