import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { buildXlsx, workbookParts, zip, type Part, type TestSheet } from './xlsx-builder.ts'
import { detectKind, guessMapping, validate } from './csv.ts'
import { openXlsx, readXlsx } from './xlsx.ts'

const header = ['Product Name (English)', 'SKU', 'Wholesale Price (USD)', 'Retail Price (USD)', 'Minimum Order Quantity', 'Case Size']
const products: TestSheet = { name: 'Products', rows: [header, ['Black Fig 8 oz candle', 'EW-08-FIG', 16, 32, 4, 4], ['Cloche matches', 'EW-MATCH', 4, 8, 12, 12]] }
const cover: TestSheet = { name: 'Cover', rows: [['Ember & Wick'], ['Price list, spring']] }

/** Replace the contents of one part, to make a workbook slightly wrong. */
const edit = (parts: Part[], name: string, f: (xml: string) => string): Part[] => parts.map(([n, d]) => n === name ? [n, f(d)] : [n, d])

test('lists worksheets in tab order with visibility and row counts, and reads each by its relationship', async () => {
  const wb = await openXlsx(buildXlsx([
    cover,
    products,
    { name: 'Notes', inline: true, rows: [['Topic', 'Note'], ['Lead time', 'Ships in 5 days'], [null, null], ['Terms', 'Net 60']] },
    { name: 'Internal costs', state: 'hidden', rows: [['SKU', 'Cost'], ['EW-08-FIG', 8.55]] },
    { name: 'Vault', state: 'veryHidden', rows: [['x']] },
    { name: 'Archive', rows: [] },
  ]))
  assert.deepEqual(wb.sheets, [
    { name: 'Cover', hidden: false, rows: 2, unreadable: false },
    { name: 'Products', hidden: false, rows: 3, unreadable: false },
    { name: 'Notes', hidden: false, rows: 3, unreadable: false }, // the all-empty row is not counted
    { name: 'Internal costs', hidden: true, rows: 2, unreadable: false },
    { name: 'Vault', hidden: true, rows: 1, unreadable: false },
    { name: 'Archive', hidden: false, rows: 0, unreadable: false },
  ])
  // The builder numbers parts backwards and starts relationship ids at 100, so only following the relationships gets these right.
  assert.deepEqual(await wb.read(0), [['Ember & Wick'], ['Price list, spring']])
  assert.deepEqual(await wb.read(1), [header, ['Black Fig 8 oz candle', 'EW-08-FIG', '16', '32', '4', '4'], ['Cloche matches', 'EW-MATCH', '4', '8', '12', '12']])
  assert.deepEqual(await wb.read(2), [['Topic', 'Note'], ['Lead time', 'Ships in 5 days'], ['Terms', 'Net 60']])
  assert.deepEqual(await wb.read(3), [['SKU', 'Cost'], ['EW-08-FIG', '8.55']])
  assert.deepEqual(await wb.read(5), [])
})

test('a chosen sheet yields only its own cells', async () => {
  const wb = await openXlsx(buildXlsx([
    { name: 'A', rows: [['alpha-1', 'alpha-2'], ['alpha-3']] },
    { name: 'B', rows: [['beta-1'], ['beta-2', 'beta-3']] },
    { name: 'C', inline: true, rows: [['gamma-1']] },
  ]))
  for (const [i, tag] of [[0, 'alpha'], [1, 'beta'], [2, 'gamma']] as const) {
    const cells = (await wb.read(i)).flat()
    assert.ok(cells.length > 0 && cells.every(c => c.startsWith(tag)), `${tag}: ${cells}`)
  }
})

test('sheet names keep spaces, XML entities and non-ASCII text', async () => {
  const names = ['Prices & Cases', 'A < B > C', `Brand "Ember" 'Wick'`, '  padded  ', 'Línea de catálogo', '価格表', 'Stock 🕯', 'Q1 – Q2']
  const wb = await openXlsx(buildXlsx(names.map((name, i) => ({ name, rows: [[`n${i}`]] }))))
  assert.deepEqual(wb.sheets.map(s => s.name), names)
  assert.deepEqual(await wb.read(4), [['n4']])
  // Numeric character references, single-quoted attributes, attributes in another order and a prefixed element all resolve.
  const parts = edit(workbookParts([{ name: 'x', rows: [['one']] }, { name: 'y', rows: [['two']] }]), 'xl/workbook.xml', xml => xml
    .replace('name="x"', 'name="Caf&#233; &#x65E5;&#26412; &amp; Co"')
    .replace(/<sheet name="y" sheetId="(\d+)" r:id="(\w+)"\/>/, (_, id, rid) => `<x:sheet r:id='${rid}' sheetId='${id}' name='Second sheet'/>`))
  const wb2 = await openXlsx(zip(parts))
  assert.deepEqual(wb2.sheets.map(s => s.name), ['Café 日本 & Co', 'Second sheet'])
  assert.deepEqual(await wb2.read(1), [['two']])
})

test('another namespace prefix for r:id works, and unknown states count as visible', async () => {
  const parts = edit(workbookParts([{ name: 'First', rows: [['a']] }, { name: 'Second', rows: [['b']] }]), 'xl/workbook.xml', xml => xml
    .replace('xmlns:r=', 'xmlns:rel=').replace(/r:id=/g, 'rel:id=').replace('<sheet name="Second"', '<sheet state="visible" name="Second"').replace('<sheet name="First"', '<sheet state="mystery" name="First"'))
  const wb = await openXlsx(zip(parts))
  assert.deepEqual(wb.sheets.map(s => [s.name, s.hidden]), [['First', false], ['Second', false]])
  assert.deepEqual(await wb.read(0), [['a']])
})

test('chart sheets are not offered and do not shift the other sheets', async () => {
  const wb = await openXlsx(buildXlsx([{ name: 'Chart', rows: [], chart: true }, cover, { name: 'Chart 2', rows: [], chart: true }, products]))
  assert.deepEqual(wb.sheets.map(s => s.name), ['Cover', 'Products'])
  assert.equal((await wb.read(1))[0][1], 'SKU')
})

test('relationship targets: absolute, other case, percent-encoded, missing xl/ prefix', async () => {
  const base = workbookParts([cover, products])
  const wbOf = (f: (rels: string) => string) => openXlsx(zip(edit(base, 'xl/_rels/workbook.xml.rels', f)))
  for (const f of [
    (r: string) => r.replace(/Target="worksheets\//g, 'Target="/xl/worksheets/'),
    (r: string) => r.replace(/Target="worksheets\//g, 'Target="WorkSheets/'),
    (r: string) => r.replace(/Target="worksheets\//g, 'Target="/worksheets/'),
    (r: string) => r.replace(/Target="worksheets\//g, 'Target="../xl/worksheets/'),
    (r: string) => r.replace(/Target="worksheets\/sheet(\d)\.xml"/g, (_, n) => `Target="worksheets/sheet%3${n}.xml"`),
  ]) {
    const wb = await wbOf(f)
    assert.deepEqual(wb.sheets.map(s => [s.name, s.rows, s.unreadable]), [['Cover', 2, false], ['Products', 3, false]], f.toString())
    assert.equal((await wb.read(1))[1][1], 'EW-08-FIG')
  }
})

test('a sheet whose relationship or part is missing is unreadable; the others still open', async () => {
  const base = workbookParts([cover, products, { name: 'Third', rows: [['t']] }])
  // No relationship for Cover (rId100).
  const noRel = await openXlsx(zip(edit(base, 'xl/_rels/workbook.xml.rels', r => r.replace(/<Relationship Id="rId100"[^>]*\/>/, ''))))
  assert.deepEqual(noRel.sheets.map(s => [s.name, s.unreadable]), [['Cover', true], ['Products', false], ['Third', false]])
  await assert.rejects(noRel.read(0), /"Cover" could not be read/)
  assert.equal((await noRel.read(1))[0][0], 'Product Name (English)')
  // Its part is not in the zip.
  const noPart = await openXlsx(zip(base.filter(([n]) => n !== 'xl/worksheets/sheet3.xml')))
  assert.deepEqual(noPart.sheets.map(s => s.unreadable), [true, false, false])
  // An external relationship is not a part.
  const ext = await openXlsx(zip(edit(base, 'xl/_rels/workbook.xml.rels', r => r.replace(/(Id="rId100"[^>]*)\/>/, '$1 TargetMode="External"/>'))))
  assert.equal(ext.sheets[0].unreadable, true)
  // Nothing readable at all is an error, not an empty list.
  await assert.rejects(openXlsx(zip(base.filter(([n]) => !n.startsWith('xl/worksheets/')))), /None of the worksheets/)
  await assert.rejects(openXlsx(zip(base.filter(([n]) => !n.startsWith('xl/worksheets/') && n !== 'xl/_rels/workbook.xml.rels').map(([n, d]) => n === 'xl/workbook.xml' ? [n, d.replace(/<sheet name="Cover"[^>]*\/>/, '').replace(/<sheet name="Third"[^>]*\/>/, '')] : [n, d]))), /The worksheet in this .xlsx file could not be read/)
})

test('a damaged sheet is unreadable without taking the workbook down; damaged shared strings are an error', async () => {
  const base = workbookParts([{ name: 'Good', inline: true, rows: [['SKU'], ['A-1']] }, { name: 'Bad', rows: [['x']] }])
  // A cell reference far outside the grid used to allocate a row of billions of cells; it must fail fast instead.
  const grid = await openXlsx(zip(edit(base, 'xl/worksheets/sheet1.xml', x => x.replace('r="A1"', 'r="ZZZZZZZZZ1"'))))
  assert.deepEqual(grid.sheets.map(s => [s.name, s.unreadable]), [['Good', false], ['Bad', true]])
  await assert.rejects(grid.read(1), /could not be read/)
  assert.deepEqual(await grid.read(0), [['SKU'], ['A-1']])
  // Bytes that are not a deflate stream, in one sheet part and then in the shared strings.
  const smash = (name: string) => {
    const bytes = new Uint8Array(zip(base, () => true))
    const at = Buffer.from(bytes).indexOf(name) + name.length // the first hit is the local header; its data follows the name
    bytes.fill(0xff, at, at + 6)
    return bytes.buffer
  }
  const half = await openXlsx(smash('xl/worksheets/sheet1.xml'))
  assert.deepEqual(half.sheets.map(s => [s.name, s.unreadable]), [['Good', false], ['Bad', true]])
  await assert.rejects(openXlsx(smash('xl/sharedStrings.xml')), /xl\/sharedStrings.xml is damaged/)
  // Truncated archive: the central directory is gone.
  await assert.rejects(openXlsx(new Uint8Array(buildXlsx([products])).slice(0, 300).buffer), /Not an .xlsx/)
})

test('input that is not a workbook is refused with a message', async () => {
  await assert.rejects(openXlsx(new TextEncoder().encode('SKU,Name\nA,B').buffer), /Not an .xlsx/)
  await assert.rejects(openXlsx(new ArrayBuffer(0)), /Not an .xlsx/)
  // A valid zip that is not a workbook.
  await assert.rejects(openXlsx(zip([['readme.txt', 'hello']])), /No worksheet found/)
  // A workbook part with no sheets in it.
  await assert.rejects(openXlsx(zip([['xl/workbook.xml', '<workbook><sheets/></workbook>']])), /No worksheet found/)
})

test('a malformed character reference in a name or cell is kept as text, not a crash', async () => {
  const sheet = workbookParts([{ name: 'x', inline: true, rows: [['p1', 'p2', 'p3']] }])
  const parts = edit(edit(sheet, 'xl/workbook.xml', xml => xml.replace('name="x"', 'name="Bad &#zzz; &#x110000; name"')),
    'xl/worksheets/sheet1.xml', xml => xml.replace('p1', 'a&#abc;b').replace('p2', 'c&#x110000;d').replace('p3', 'e&#65;f'))
  const wb = await openXlsx(zip(parts))
  assert.equal(wb.sheets[0].name, 'Bad &#zzz; &#x110000; name')
  assert.deepEqual(await wb.read(0), [['a&#abc;b', 'c&#x110000;d', 'eAf']])
})

test('a workbook with no sheet list falls back to the conventional first part; readXlsx is the first sheet in tab order', async () => {
  const bare = zip([['xl/worksheets/sheet1.xml', workbookParts([{ name: 's', inline: true, rows: [['k', 'v'], ['1', '2']] }]).find(([n]) => n.startsWith('xl/worksheets/'))![1]]])
  const wb = await openXlsx(bare)
  assert.deepEqual(wb.sheets.map(s => s.name), ['Sheet1'])
  assert.deepEqual(await wb.read(0), [['k', 'v'], ['1', '2']])
  const multi = buildXlsx([cover, products])
  assert.deepEqual(await readXlsx(multi), [['Ember & Wick'], ['Price list, spring']])
})

test('the Faire fixture opens on the same rows as before and lists both of its sheets', async () => {
  const b = readFileSync(new URL('./fixtures/faire-products.xlsx', import.meta.url))
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
  const wb = await openXlsx(buf)
  assert.deepEqual(wb.sheets.map(s => [s.name, s.hidden, s.unreadable]), [['Products', false, false], ['Column Definitions', false, false]])
  const t = await wb.read(0)
  assert.deepEqual(t, await readXlsx(buf))
  assert.equal(detectKind(t[0]), 'faire')
  assert.equal(validate(t, 'faire', guessMapping(t[0], 'faire')).rows.length, 4)
  // The other sheet is a different table: it is not a Faire export and never mixes into the first.
  const defs = await wb.read(1)
  assert.notEqual(detectKind(defs[0]), 'faire')
  assert.ok(!t.flat().some(c => defs.flat().includes(c) && c.length > 20))
})

test('detection and column mapping depend only on the chosen sheet', async () => {
  const wb = await openXlsx(buildXlsx([cover, products, { name: 'Costs', rows: [['SKU', 'Materials', 'Packaging', 'Labour minutes'], ['EW-08-FIG', 3.1, 2.3, 6]] }]))
  const kinds = await Promise.all([0, 1, 2].map(async i => { const t = await wb.read(i); return [detectKind(t[0]), Object.keys(guessMapping(t[0], detectKind(t[0]))).length] as const }))
  assert.deepEqual(kinds, [['generic', 0], ['faire', 6], ['costsheet', 4]])
})
