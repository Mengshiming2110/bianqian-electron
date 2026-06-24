import assert from 'node:assert/strict'

import {
  buildMaterial,
  extractSalesOwner,
  extractSpecialNotes,
  firstDate,
  normalizeQuantityCopyValue
} from '../src/renderer/src/lib/mail-detail-summary.mjs'

assert.equal(firstDate('2026/6/23'), '2026-06-23')
assert.equal(normalizeQuantityCopyValue('5,120 件'), '5120')

assert.equal(extractSalesOwner([['张三']], ['PM'], ''), '张三')
assert.equal(extractSalesOwner([['']], ['PM'], ''), '')

const notes = extractSpecialNotes('请多打印几份备用外箱标签。BU 名称请使用 BD2-AJ。Best Regards Lia')
assert.equal(notes.length, 2)
assert.ok(notes.some((note) => note.includes('打印') && note.includes('备用外箱标签')))
assert.ok(notes.some((note) => note.includes('BU') && note.includes('BD2-AJ')))
assert.ok(notes.every((note) => !/best regards|lia/i.test(note)))

const material = buildMaterial(
  ['APN-100', 'OEM-200', 'LY-300', '5,120 件', 'BD2-AJ', '标签 vendor code 1000248'],
  ['APN', 'OEM PN', 'LY PN', 'QTY', 'Config', 'Remark'],
  1,
  1
)

assert.deepEqual(
  material.fields.map((field) => field.key),
  ['apn', 'oemPn', 'lyPn', 'quantity', 'config', 'remark']
)
assert.equal(material.index, 1)
assert.equal(material.title, 'APN-100')
assert.equal(material.fields.find((field) => field.key === 'quantity')?.copyValue, '5120')
assert.equal(material.fields.find((field) => field.key === 'remark')?.copyValue, '标签 vendor code 1000248')

const lyTitleMaterial = buildMaterial(
  ['', 'OEM-200', 'LY-300', '1', '', ''],
  ['APN', 'OEM PN', 'LY PN', 'QTY', 'Config', 'Remark'],
  2,
  3
)
assert.equal(lyTitleMaterial.index, 2)
assert.equal(lyTitleMaterial.title, 'LY-300')

const fallbackTitleMaterial = buildMaterial(
  ['', '', '', '1', '', ''],
  ['APN', 'OEM PN', 'LY PN', 'QTY', 'Config', 'Remark'],
  3,
  3
)
assert.equal(fallbackTitleMaterial.index, 3)
assert.equal(fallbackTitleMaterial.title, '第 3 款')

console.log('mail detail summary verification passed')
