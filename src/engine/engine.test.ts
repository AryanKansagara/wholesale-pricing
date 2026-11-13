import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { analyse, channelResult, effectivePrices, wholesaleFor, checks, compareSnapshots, orderEconomics, pricePoint, propose, snapshotRows, unitCost, type Component, type Product, type Settings } from './model.ts'
import { defaultSettings } from './fees.ts'
import { detectKind, guessMapping, parseCsv, parseMoney, toCsv, validate } from './csv.ts'
import { fairePriceCsv, mergeImport, shopifyPriceCsv } from './catalog.ts'
import { SAMPLES } from './sample.ts'

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const S = (p: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), overheadMonthly: 0, ...p })
const P = (p: Partial<Product> = {}): Product => ({ id: 'p', sku: 'A', name: 'A', bom: [], materials: 0, packaging: 0, labourMinutes: 0, caseSize: 1, moq: 1, ...p })
const comps: Component[] = [
  { id: 'wax', name: 'Wax', kind: 'material', unitCost: 0.2, unit: 'oz' },
  { id: 'box', name: 'Gift box', kind: 'packaging', unitCost: 1, unit: 'each' },
  { id: 'kraft', name: 'Kraft', kind: 'packaging', unitCost: 0.3, unit: 'each' },
]

test('unit cost rolls up BOM, flat costs, labour and overhead', () => {
  const c = unitCost(P({ bom: [{ componentId: 'wax', qty: 8 }, { componentId: 'box', qty: 1 }], materials: 0.5, packaging: 0.1, labourMinutes: 6, overhead: 0.75 }), comps, S({ labourRate: 20 }))
  close(c.materials, 2.1); close(c.packaging, 1.1); close(c.labour, 2); close(c.overhead, 0.75); close(c.total, 5.95)
})

test('overhead allocation divides monthly overhead by monthly units', () => {
  close(unitCost(P(), comps, S({ overheadMonthly: 1200, unitsPerMonth: 800 })).overhead, 1.5)
  close(unitCost(P(), comps, S({ overheadMonthly: 1200, unitsPerMonth: 0 })).overhead, 0)
})

test('unknown BOM components are ignored instead of producing NaN', () => {
  close(unitCost(P({ bom: [{ componentId: 'gone', qty: 3 }] }), comps, S()).total, 0)
})

test('tier swaps components, cuts labour and overrides packaging', () => {
  const p = P({ bom: [{ componentId: 'box', qty: 1 }], packaging: 0.4, labourMinutes: 30 })
  const s = S({ labourRate: 20 })
  close(unitCost(p, comps, s).total, 1 + 0.4 + 10)
  close(unitCost(p, comps, s, { swaps: { box: 'kraft' }, labourCut: 0.2, packaging: 0 }).total, 0.3 + 0 + 8)
})

test('price points round up by default and to nearest for anchors', () => {
  assert.equal(pricePoint(17.2, 'whole'), 18)
  assert.equal(pricePoint(18, 'whole'), 18)
  assert.equal(pricePoint(17.2, 'half'), 17.5)
  assert.equal(pricePoint(17.2, 'charm'), 17.99)
  assert.equal(pricePoint(17.99, 'charm'), 17.99)
  assert.equal(pricePoint(18.4, 'charm', 'nearest'), 17.99)
  assert.equal(pricePoint(17.234, 'none'), 17.23)
  assert.equal(pricePoint(0, 'whole'), 0)
})

test('keystone strategy: wholesale 2x cost, MSRP 2x wholesale, rounded', () => {
  const p = propose(P(), 4.3, S({ strategy: { kind: 'keystone', multiple: 2 }, rounding: 'whole' }))
  assert.equal(p.msrp, 18) // 4.3*2*2 = 17.2 -> 18
  assert.equal(p.wholesale, 9)
})

test('target margin strategy never undershoots the target after rounding', () => {
  const s = S({ strategy: { kind: 'margin', target: 0.6 }, rounding: 'charm' })
  const p = propose(P(), 5, s)
  assert.ok((p.wholesale - 5) / p.wholesale >= 0.6 - 1e-9)
  assert.equal(p.msrp, 25.99) // 12.50 wholesale -> 25.00 -> next .99
})

test('competitor anchor uses the competitor MSRP, falling back to keystone', () => {
  const s = S({ strategy: { kind: 'anchor' }, rounding: 'whole', retailMarkup: 2.2 })
  const p = propose(P({ competitorMsrp: 27.6 }), 5, s)
  assert.equal(p.msrp, 28); close(p.wholesale, 12.72) // rounded down: 28 / 12.72 keeps the 2.2x markup
  const f = propose(P(), 5, s)
  assert.match(f.note!, /keystone/)
  assert.equal(f.msrp, 22)
})

test('channel contribution peels commission, processing, allocated order fee and unit fees', () => {
  const r = channelResult('faireNew', 10, 6, { enabled: true, commission: 0.15, processing: 0.03, perOrder: 10, perUnit: 0, adsRate: 0, adsShare: 0, fulfilment: 0, aov: 200 })
  close(r.commission, 1.5); close(r.processing, 0.3); close(r.orderFees, 0.5)
  close(r.contribution, 10 - 1.5 - 0.3 - 0.5 - 6); close(r.margin, r.contribution / 10)
})

test('Etsy offsite ads apply only to the attributed share of orders', () => {
  const r = channelResult('etsy', 20, 5, { enabled: true, commission: 0.065, processing: 0.03, perOrder: 0.25, perUnit: 0.2, adsRate: 0.15, adsShare: 0.1, fulfilment: 1, aov: 40 })
  close(r.ads, 0.3); close(r.fees, 1.3 + 0.6 + 0.125 + 0.2 + 0.3 + 1)
})

test('sample candle travel tin is flagged as losing money on a first Faire order', () => {
  const b = SAMPLES.find(x => x.id === 'ember-wick')!.build()
  const res = analyse(b.products, b.components, b.settings)
  const tin = res.find(r => r.product.sku === 'EW-04-FIG')!
  assert.ok(tin.issues.some(i => i.code === 'faire-first-loss'))
  assert.ok(tin.channels.find(c => c.channel === 'faireReorder')!.contribution > tin.channels.find(c => c.channel === 'faireNew')!.contribution)
  // The 8 oz candle is healthy on a first order.
  assert.ok(!res.find(r => r.product.sku === 'EW-08-FIG')!.issues.some(i => i.code === 'faire-first-loss'))
})

test('the wholesale tier fixes the travel tin', () => {
  const b = SAMPLES.find(x => x.id === 'ember-wick')!.build()
  const tin = analyse(b.products, b.components, b.settings, b.tier).find(r => r.product.sku === 'EW-04-FIG')!
  assert.ok(tin.channels.find(c => c.channel === 'faireNew')!.contribution > 0)
})

test('ceramics sample is labour-dominated', () => {
  const b = SAMPLES.find(x => x.id === 'kiln-clay')!.build()
  for (const r of analyse(b.products, b.components, b.settings)) assert.ok(r.cost.labour > r.cost.materials + r.cost.packaging)
})

test('MAP check flags a site or Etsy price below MSRP, and sub-keystone markups', () => {
  const s = S()
  const prices = { wholesale: 10, msrp: 18, source: 'current' as const }
  const codes = checks(P({ dtcPrice: 16, etsyPrice: 17 }), prices, [], s).map(i => i.code)
  assert.ok(codes.includes('map-dtc')); assert.ok(codes.includes('map-etsy')); assert.ok(codes.includes('markup'))
  assert.deepEqual(checks(P({ dtcPrice: 20 }), { ...prices, msrp: 20 }, [], s).map(i => i.code), [])
})

test('MOQ not a multiple of case size is noted', () => {
  assert.ok(checks(P({ moq: 5, caseSize: 2 }), { wholesale: 5, msrp: 10, source: 'current' }, [], S()).some(i => i.code === 'moq-case'))
})

test('current prices win over proposals; wholesale-only gets keystone MSRP', () => {
  const s = S()
  const [a, b, c] = analyse([P({ wholesale: 8, msrp: 18 }), P({ wholesale: 8 }), P({ materials: 3 })], comps, s)
  assert.deepEqual([a.prices.wholesale, a.prices.msrp, a.prices.source], [8, 18, 'current'])
  assert.equal(b.prices.msrp, 16)
  assert.equal(c.prices.source, 'proposed')
})

test('order economics: break-even first order and payback with reorders', () => {
  const s = S({ orderMinimum: 100, firstOrderValue: 100, reorderValue: 200, reorderRate: 0.5, reordersPerYear: 2, years: 1 })
  // Cost ratio 0.8: first order margin share 1 - 0.15 - 0.03 - 0.8 = 0.02 -> $2 - $10 = -$8
  const res = analyse([P({ materials: 8, wholesale: 10, msrp: 20 })], comps, s)
  const e = orderEconomics(res, s)
  close(e.costRatio, 0.8); close(e.firstProfit, -8); close(e.breakEvenFirstOrder, 500)
  close(e.reorderProfit, 4)
  assert.deepEqual(e.curve.map(x => Math.round(x * 100) / 100), [-8, -6, -5])
  assert.equal(e.paybackReorder, null)
  const e2 = orderEconomics(res, { ...s, reorderRate: 1, years: 2 })
  assert.equal(e2.paybackReorder, 2)
})

test('first order value cannot be below the order minimum', () => {
  const s = S({ orderMinimum: 300, firstOrderValue: 100 })
  const res = analyse([P({ materials: 2, wholesale: 10, msrp: 20 })], comps, s)
  close(orderEconomics(res, s).firstProfit, 300 * (1 - 0.18 - 0.2) - 10)
})

test('mix weights change the blended cost ratio', () => {
  const s = S()
  const res = analyse([P({ id: 'a', materials: 2, wholesale: 10, msrp: 20, mixWeight: 3 }), P({ id: 'b', sku: 'B', materials: 8, wholesale: 10, msrp: 20, mixWeight: 1 })], comps, s)
  close(orderEconomics(res, s).costRatio, (3 * 2 + 8) / 40)
})

test('CSV parser handles quotes, embedded newlines, CRLF, BOM and semicolons', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","line1\nline2"\r\n"q""t",2\n'), [['a', 'b'], ['x, y', 'line1\nline2'], ['q"t', '2']])
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']])
  assert.equal(toCsv([['a,b', 'c"d']]), '"a,b","c""d"\n')
})

test('money parsing accepts symbols, thousands and European decimals', () => {
  assert.equal(parseMoney('$1,234.50'), 1234.5); assert.equal(parseMoney('12,50'), 12.5); assert.equal(parseMoney('(3.00)'), -3); assert.equal(parseMoney('abc'), null); assert.equal(parseMoney(''), null)
})

test('format detection recognises Shopify, Etsy, Faire, cost sheets and BOMs', () => {
  assert.equal(detectKind(['Handle', 'Title', 'Option1 Value', 'Variant SKU', 'Variant Price', 'Cost per item']), 'shopify')
  assert.equal(detectKind(['TITLE', 'DESCRIPTION', 'PRICE', 'CURRENCY_CODE', 'QUANTITY', 'TAGS', 'SKU']), 'etsy')
  assert.equal(detectKind(['Product Name (English)*', 'SKU', 'Wholesale Price (USD)*', 'Retail Price (USD)*']), 'faire')
  assert.equal(detectKind(['SKU', 'Materials', 'Packaging', 'Labour minutes']), 'costsheet')
  assert.equal(detectKind(['sku', 'component', 'qty', 'unit cost']), 'bom')
  assert.equal(detectKind(['code', 'description', 'amount']), 'generic')
})

test('Shopify import fills variant titles, skips image rows and reports bad lines', () => {
  const t = parseCsv('Handle,Title,Variant SKU,Variant Price,Variant Compare At Price,Cost per item\nfig,Fig candle,FIG-8,34,,8.5\nfig,,FIG-4,14,,\nfig,,,,,\nmug,Mug,MUG,abc,,\nx,X,,5,,\n')
  const v = validate(t, 'shopify', guessMapping(t[0], 'shopify'))
  // A variant without a SKU (very common in real exports) is keyed by its handle.
  assert.deepEqual(v.rows.map(r => [r.values.sku, r.values.name]), [['FIG-8', 'Fig candle'], ['FIG-4', 'Fig candle'], ['x', 'X']])
  assert.ok(v.issues.some(i => i.line === 5 && /not a number/.test(i.message)))
})

test('validation reports unmapped required columns and duplicates', () => {
  const t = parseCsv('name,price\nA,1')
  assert.ok(validate(t, 'faire', {}).issues.some(i => /Wholesale|SKU/.test(i.message)))
  const d = parseCsv('sku,name\nA,x\nA,y')
  assert.ok(validate(d, 'generic', guessMapping(d[0], 'generic')).issues.some(i => i.level === 'warn' && /Duplicate/.test(i.message)))
})

test('cost sheet and BOM merge into the catalog and build shared components', () => {
  const s = S({ labourRate: 20 })
  let n = 0
  const id = () => `id${++n}`
  const cs = parseCsv('SKU,Name,Materials,Packaging,Labour minutes,Labour rate\nA,Alpha,1.5,0.4,6,30\n')
  const m1 = mergeImport([], [], 'costsheet', validate(cs, 'costsheet', guessMapping(cs[0], 'costsheet')).rows, s, id)
  assert.equal(m1.added, 1); assert.equal(m1.products[0].labourMinutes, 9) // 6 min at $30 = 9 min at $20
  const bom = parseCsv('sku,component,qty,unit cost,kind\nA,Gift box,1,0.95,packaging\nB,Gift box,2,0.95,packaging\n')
  const m2 = mergeImport(m1.products, [], 'bom', validate(bom, 'bom', guessMapping(bom[0], 'bom')).rows, s, id)
  assert.equal(m2.components.length, 1); assert.equal(m2.components[0].kind, 'packaging')
  assert.equal(m2.products.length, 2); assert.equal(m2.products[1].bom[0].qty, 2)
  close(unitCost(m2.products[0], m2.components, s).total, 1.5 + 0.4 + 0.95 + 3)
})

test('price update CSVs have the Shopify and Faire columns', () => {
  const b = SAMPLES[0].build()
  const res = analyse(b.products, b.components, b.settings)
  const sh = parseCsv(shopifyPriceCsv(res))
  assert.deepEqual(sh[0].slice(0, 6), ['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Price'])
  assert.equal(sh.length, b.products.length + 1)
  const fa = parseCsv(fairePriceCsv(res))
  assert.equal(fa[0][2], 'Wholesale Price (USD)'); assert.equal(fa[1][2], '16.00')
})

test('snapshot compare finds cost changes, added SKUs and fee changes', () => {
  const b = SAMPLES[0].build()
  const before = { rows: snapshotRows(analyse(b.products, b.components, b.settings)), fees: b.settings.fees, labourRate: b.settings.labourRate }
  const comps2 = b.components.map(c => c.id === 'wax' ? { ...c, unitCost: 0.3 } : c)
  const s2 = structuredClone(b.settings); s2.fees.faireNew.commission = 0.25; s2.labourRate = 22
  const prods2 = [...b.products, { ...b.products[0], id: 'new', sku: 'EW-NEW' }]
  const after = { rows: snapshotRows(analyse(prods2, comps2, s2)), fees: s2.fees, labourRate: s2.labourRate }
  const d = compareSnapshots(before, after)
  assert.equal(d.rows.find(r => r.sku === 'EW-NEW')!.status, 'added')
  const fig = d.rows.find(r => r.sku === 'EW-08-FIG')!
  assert.equal(fig.status, 'changed'); assert.ok(fig.cost[1]! > fig.cost[0]!)
  assert.ok(fig.cm.faireNew![1]! < fig.cm.faireNew![0]!)
  assert.deepEqual(d.fees.map(f => [f.channel, f.field]), [['faireNew', 'commission']])
  assert.deepEqual(d.labour, [20, 22])
})

// ---- Real-layout fixtures (headers copied from real Shopify and Etsy files; products invented) ----
const fixture = (name: string) => parseCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const load = (name: string) => { const t = fixture(name); const kind = detectKind(t[0]); return { t, kind, v: validate(t, kind, guessMapping(t[0], kind)) } }

test('legacy Shopify export: blank variant SKUs keyed by handle and option, image and gift card rows skipped', () => {
  const { kind, v } = load('shopify-legacy-export.csv')
  assert.equal(kind, 'shopify')
  assert.equal(v.issues.length, 0)
  assert.equal(v.skipped, 2)
  assert.deepEqual(v.rows.map(r => [r.values.sku, r.values.price, r.values.cost ?? null]), [['black-fig-candle-8-oz', 34, 7.85], ['black-fig-candle-4-oz-tin', 14, 4.1], ['EW-MATCH', 8, null]])
  assert.equal(v.rows[1].values.optionName, 'Size') // carried down from the first row of the handle
})

test('2024 Shopify template (URL handle, SKU, Price, Compare-at price) is read as Shopify, not Etsy', () => {
  const { kind, v } = load('shopify-2024-export.csv')
  assert.equal(kind, 'shopify')
  assert.deepEqual(v.rows.map(r => [r.values.sku, r.values.handle, r.values.price, r.values.msrp ?? null, r.values.cost]), [
    ['KC-MUG-OAT', 'oatmeal-speckle-mug', 46, null, 21.4], ['KC-MUG-SEA', 'oatmeal-speckle-mug', 48, 52, 23.1], ['bud-vase', 'bud-vase', 38, null, 14.75],
  ])
})

test('Shopify variants round-trip: names carry the option, the price file keeps handle, title once and option values', () => {
  const { kind, v } = load('shopify-legacy-export.csv')
  let n = 0
  const m = mergeImport([], [], kind, v.rows, S(), () => `id${n++}`)
  assert.deepEqual(m.products.map(p => p.name), ['Black Fig Candle - 8 oz', 'Black Fig Candle - 4 oz tin', 'Cloche Matches'])
  const out = parseCsv(shopifyPriceCsv(analyse(m.products, [], S())))
  assert.deepEqual(out.slice(1).map(r => r.slice(0, 5)), [
    ['black-fig-candle', 'Black Fig Candle', 'Size', '8 oz', 'black-fig-candle-8-oz'],
    ['black-fig-candle', '', 'Size', '4 oz tin', 'black-fig-candle-4-oz-tin'],
    ['cloche-matches', 'Cloche Matches', 'Title', 'Default Title', 'EW-MATCH'],
  ])
})

test('Etsy listings download: uppercase headers, multi-line quoted descriptions, missing SKU from title', () => {
  const { kind, v } = load('etsy-listings.csv')
  assert.equal(kind, 'etsy')
  assert.deepEqual(v.rows.map(r => [r.values.sku, r.values.price]), [['PF-CARD-BDAY', 6], ['PF-NB-A5', 19], ['BOTANICAL-STICKER-SHEET', 5]])
  const m = mergeImport([], [], kind, v.rows, S(), () => 'x')
  assert.equal(m.products[0].etsyPrice, 6)
  assert.equal(m.products[0].dtcPrice, undefined)
})

test('wholesale is rounded down from MSRP so charm prices never break keystone', () => {
  assert.equal(wholesaleFor(15.99, 2), 7.99)
  assert.equal(wholesaleFor(32, 2), 16)
  assert.equal(wholesaleFor(28, 2.2), 12.72)
  const s = S({ rounding: 'charm' })
  for (const cost of [0.61, 1.2, 2.75, 4.33]) {
    const [r] = analyse([P({ materials: cost })], [], s)
    assert.ok(r.prices.msrp / r.prices.wholesale >= 2, `${r.prices.msrp}/${r.prices.wholesale}`)
    assert.ok(!r.issues.some(i => i.code === 'markup'))
  }
})

test('a catalog with only wholesale gets MSRP from the project markup, not a fixed 2x', () => {
  const pr = effectivePrices(P({ wholesale: 10 }), { wholesale: 0, msrp: 0 }, 2.5)
  assert.deepEqual([pr.wholesale, pr.msrp, pr.source], [10, 25, 'current'])
})

test('Etsy contribution matches a hand calculation from the published fee schedule', () => {
  // $34 candle, $10 cost: 6.5% transaction, 3% + $0.25 processing on a $38 order, $0.20 listing, 15% offsite ads on 12% of orders, $1.25 fulfilment.
  const r = channelResult('etsy', 34, 10, defaultSettings().fees.etsy)
  const hand = 34 - 34 * 0.065 - 34 * 0.03 - 0.25 * 34 / 38 - 0.20 - 34 * 0.15 * 0.12 - 1.25 - 10
  close(r.contribution, hand)
  close(r.contribution, 18.4843, 1e-3) // 34 - 2.21 - 1.02 - 0.22 - 0.20 - 0.61 - 1.25 - 10
})
