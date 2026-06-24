import assert from 'node:assert/strict'

import {
  buildMaterial,
  extractByLabel,
  extractSpecialNotes,
  firstDate,
  normalizeQuantityCopyValue
} from '../src/renderer/src/lib/mail-detail-summary.mjs'

// firstDate
assert.equal(firstDate('2026/6/23'), '2026-06-23')
assert.equal(firstDate('6月24日'), '2026-06-24')

// normalizeQuantityCopyValue
assert.equal(normalizeQuantityCopyValue('5,120 件'), '5120')
assert.equal(normalizeQuantityCopyValue(''), '')

// extractByLabel
assert.equal(extractByLabel('客户: Foxconn', ['客户']), 'Foxconn')
assert.equal(extractByLabel('销售负责人：张伟\n出货客户：立讯', ['销售负责人']), '张伟')

// extractSpecialNotes
const notes = extractSpecialNotes('请多打印几份备用外箱标签。BU 名称请使用 BD2-AJ。Best Regards Lia')
assert.ok(notes.length >= 2)
assert.ok(notes.some((note) => note.includes('打印') && note.includes('备用外箱标签')))
assert.ok(notes.some((note) => note.includes('BU') && note.includes('BD2-AJ')))
assert.ok(notes.every((note) => !/best regards|lia/i.test(note)))

// buildMaterial — 动态表头
const material = buildMaterial(
  ['810-30095', '810-30095SLY02TONB', '882-AKZ805-02-00', '5,120', 'CxB: Black7', 'vendor code 1000248'],
  ['APN', 'OEM PN', 'LY PN', '数量', 'Config', '备注'],
  1,
  3
)
assert.equal(material.index, 1)
assert.equal(material.total, 3)
assert.equal(material.title, '810-30095')  // 第一个非空单元格

// 字段数 = 表头数
assert.equal(material.fields.length, 6)

// 数量列被识别并归一化
const qtyField = material.fields.find((f) => f.label === '数量')
assert.ok(qtyField)
assert.equal(qtyField.copyValue, '5120')
assert.equal(qtyField.value, '5,120')

// 备注列
const remarkField = material.fields.find((f) => f.label === '备注')
assert.ok(remarkField)
assert.equal(remarkField.copyValue, 'vendor code 1000248')

// 空值列：APN 列第一行有值，不是 missing
const apnField = material.fields.find((f) => f.label === 'APN')
assert.ok(apnField)
assert.equal(apnField.missing, false)

// 带空值的行
const emptyMaterial = buildMaterial(
  ['', 'OEM-200', '', '1', '', ''],
  ['APN', 'OEM PN', 'LY PN', '数量', 'Config', '备注'],
  2,
  3
)
assert.equal(emptyMaterial.title, 'OEM-200')
assert.equal(emptyMaterial.fields[0].missing, true)  // APN 为空
assert.equal(emptyMaterial.fields[1].missing, false)  // OEM PN 有值

// 全空行 — fallback title
const fallbackMaterial = buildMaterial(
  ['', '', '', '1', '', ''],
  ['APN', 'OEM PN', 'LY PN', '数量', 'Config', '备注'],
  3,
  3
)
assert.equal(fallbackMaterial.title, '1')  // 数量有值"1"，取第一个非空

console.log('mail detail summary verification passed')
