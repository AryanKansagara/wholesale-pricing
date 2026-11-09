// CSV parsing, source detection, column mapping and validation for catalog and cost-sheet imports.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const s = text.replace(/^﻿/, '')
  const delim = sniffDelimiter(s)
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

function sniffDelimiter(s: string) {
  const line = s.slice(0, s.indexOf('\n') >>> 0)
  const counts = [',', ';', '\t'].map(d => [d, line.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows.map(r => r.map(v => {
    const t = v === undefined || v === null ? '' : String(v)
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }).join(',')).join('\n') + '\n'
}

export type Kind = 'shopify' | 'etsy' | 'faire' | 'costsheet' | 'bom' | 'generic'
export const KIND_LABEL: Record<Kind, string> = {
  shopify: 'Shopify product export', etsy: 'Etsy listings export', faire: 'Faire product export', costsheet: 'Cost sheet', bom: 'Bill of materials', generic: 'Generic catalog CSV',
}

export type Field = 'sku' | 'name' | 'handle' | 'category' | 'price' | 'wholesale' | 'msrp' | 'cost' | 'materials' | 'packaging' | 'labourMinutes' | 'labourRate' | 'overhead' | 'moq' | 'caseSize' | 'competitorMsrp' | 'component' | 'qty' | 'unitCost' | 'unit' | 'componentKind'

export const FIELD_LABEL: Record<Field, string> = {
  sku: 'SKU', name: 'Product name', handle: 'Handle / group', category: 'Category', price: 'Retail price (your site)', wholesale: 'Wholesale price', msrp: 'MSRP / retail price',
  cost: 'Cost per item', materials: 'Materials ($/unit)', packaging: 'Packaging ($/unit)', labourMinutes: 'Labour minutes', labourRate: 'Labour rate ($/hr)', overhead: 'Overhead ($/unit)',
  moq: 'Minimum order qty', caseSize: 'Case size', competitorMsrp: 'Competitor MSRP', component: 'Component', qty: 'Quantity per unit', unitCost: 'Component unit cost', unit: 'Unit', componentKind: 'Material or packaging',
}

const SYN: Record<Field, string[]> = {
  sku: ['variant sku', 'sku', 'item sku', 'product sku', 'style number', 'style #'],
  name: ['title', 'product name (english)', 'product name', 'name', 'item', 'product'],
  handle: ['handle', 'product token', 'listing id'],
  category: ['type', 'product type', 'category', 'product category'],
  price: ['variant price', 'price', 'retail price (your site)', 'dtc price', 'website price'],
  wholesale: ['wholesale price (usd)', 'wholesale price', 'wholesale', 'usd unit wholesale price', 'wholesale_price'],
  msrp: ['retail price (usd)', 'retail price', 'msrp', 'usd unit retail price', 'suggested retail price', 'srp'],
  cost: ['cost per item', 'unit cost', 'cost', 'cogs'],
  materials: ['materials', 'material cost', 'materials cost', 'raw materials'],
  packaging: ['packaging', 'packaging cost', 'pack'],
  labourMinutes: ['labour minutes', 'labor minutes', 'minutes', 'labour (min)', 'labor (min)', 'make time (min)'],
  labourRate: ['labour rate', 'labor rate', 'hourly rate', 'rate per hour'],
  overhead: ['overhead', 'overhead allocation', 'overhead per unit'],
  moq: ['minimum order quantity', 'order minimum quantity', 'moq', 'min qty', 'minimum'],
  caseSize: ['case size', 'case pack', 'pack size', 'case qty'],
  competitorMsrp: ['competitor msrp', 'competitor price', 'comp price'],
  component: ['component', 'component name', 'material', 'part'],
  qty: ['qty', 'quantity', 'qty per unit', 'amount'],
  unitCost: ['component cost', 'unit cost', 'cost per unit', 'cost'],
  unit: ['unit', 'uom'],
  componentKind: ['kind', 'type', 'component type'],
}

const norm = (h: string) => h.toLowerCase().replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim()

export function detectKind(headers: string[]): Kind {
  const h = new Set(headers.map(norm))
  if (h.has('handle') && (h.has('variant sku') || h.has('variant price'))) return 'shopify'
  if (h.has('title') && h.has('price') && (h.has('currency code') || h.has('quantity') || h.has('tags')) && !h.has('handle')) return 'etsy'
  if ([...h].some(x => x.startsWith('wholesale price')) && [...h].some(x => x.startsWith('retail price') || x.includes('product name'))) return 'faire'
  if ([...h].some(x => x === 'component' || x === 'component name') && [...h].some(x => x.startsWith('qty') || x === 'quantity')) return 'bom'
  if ([...h].some(x => SYN.labourMinutes.includes(x) || SYN.materials.includes(x))) return 'costsheet'
  return 'generic'
}

export const KIND_FIELDS: Record<Kind, Field[]> = {
  shopify: ['sku', 'name', 'handle', 'category', 'price', 'msrp', 'cost'],
  etsy: ['sku', 'name', 'price'],
  faire: ['sku', 'name', 'wholesale', 'msrp', 'moq', 'caseSize'],
  costsheet: ['sku', 'name', 'materials', 'packaging', 'labourMinutes', 'labourRate', 'overhead', 'moq', 'caseSize', 'competitorMsrp'],
  bom: ['sku', 'component', 'qty', 'unitCost', 'unit', 'componentKind'],
  generic: ['sku', 'name', 'category', 'price', 'wholesale', 'msrp', 'cost', 'moq', 'caseSize'],
}

export const REQUIRED: Record<Kind, Field[]> = {
  shopify: ['sku'], etsy: ['name', 'price'], faire: ['sku', 'wholesale'], costsheet: ['sku'], bom: ['sku', 'component', 'qty'], generic: ['sku'],
}

export type Mapping = Partial<Record<Field, number>>

export function guessMapping(headers: string[], kind: Kind): Mapping {
  const h = headers.map(norm)
  const m: Mapping = {}
  const used = new Set<number>()
  for (const f of KIND_FIELDS[kind]) {
    // Shopify's "Variant Compare At Price" is the closest thing it has to an MSRP.
    const syn = kind === 'shopify' && f === 'msrp' ? ['variant compare at price'] : kind === 'shopify' && f === 'name' ? ['title'] : SYN[f]
    let idx = -1
    for (const s of syn) { idx = h.findIndex((x, i) => !used.has(i) && x === s); if (idx >= 0) break }
    if (idx < 0) for (const s of syn) { idx = h.findIndex((x, i) => !used.has(i) && x.startsWith(s)); if (idx >= 0) break }
    if (idx >= 0) { m[f] = idx; used.add(idx) }
  }
  return m
}

export interface RowIssue { line: number; level: 'error' | 'warn'; message: string }
export interface ImportRow { line: number; values: Partial<Record<Field, string | number>> }
export interface Validated { rows: ImportRow[]; issues: RowIssue[]; skipped: number }

const NUMERIC: Field[] = ['price', 'wholesale', 'msrp', 'cost', 'materials', 'packaging', 'labourMinutes', 'labourRate', 'overhead', 'moq', 'caseSize', 'competitorMsrp', 'qty', 'unitCost']

export function parseMoney(v: string): number | null {
  const t = v.trim().replace(/^\((.*)\)$/, '-$1').replace(/[$£€\s]|USD|CAD/gi, '')
  if (!t) return null
  // "1.234,56" style
  const s = /,\d{1,2}$/.test(t) && !/\.\d+,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function validate(table: string[][], kind: Kind, map: Mapping): Validated {
  const issues: RowIssue[] = []
  const rows: ImportRow[] = []
  let skipped = 0
  const seen = new Map<string, number>()
  let lastHandle = '', lastName = ''
  for (const f of REQUIRED[kind]) if (map[f] === undefined) issues.push({ line: 1, level: 'error', message: `No column mapped to ${FIELD_LABEL[f]}.` })
  if (issues.length) return { rows, issues, skipped: table.length - 1 }
  for (let i = 1; i < table.length; i++) {
    const r = table[i], line = i + 1
    const values: ImportRow['values'] = {}
    let bad = false
    for (const [f, idx] of Object.entries(map) as [Field, number][]) {
      const raw = (r[idx] ?? '').trim()
      if (raw === '') continue
      if (NUMERIC.includes(f)) {
        const n = parseMoney(raw)
        if (n === null) { issues.push({ line, level: 'error', message: `${FIELD_LABEL[f]} "${raw}" is not a number.` }); bad = true; continue }
        if (n < 0) { issues.push({ line, level: 'error', message: `${FIELD_LABEL[f]} is negative.` }); bad = true; continue }
        values[f] = n
      } else values[f] = raw
    }
    // Shopify repeats the handle on variant rows and leaves the title blank.
    if (kind === 'shopify') {
      const handle = String(values.handle ?? '')
      if (handle && handle === lastHandle && !values.name) values.name = lastName
      if (handle) lastHandle = handle
      if (values.name) lastName = String(values.name)
      if (!values.sku && !values.price) { skipped++; continue } // image-only rows
    }
    if (kind === 'etsy' && !values.sku) values.sku = slug(String(values.name ?? `etsy-${line}`))
    if (bad) { skipped++; continue }
    const sku = String(values.sku ?? '')
    if (!sku) { issues.push({ line, level: 'error', message: 'Missing SKU; row skipped.' }); skipped++; continue }
    if (kind !== 'bom') {
      if (seen.has(sku)) { issues.push({ line, level: 'warn', message: `Duplicate SKU ${sku} (first on line ${seen.get(sku)}); later row wins.` }) }
      seen.set(sku, line)
      if (!values.name) issues.push({ line, level: 'warn', message: `No name for ${sku}; using the SKU.` })
      if (typeof values.wholesale === 'number' && typeof values.msrp === 'number' && values.msrp < values.wholesale) issues.push({ line, level: 'warn', message: `MSRP below wholesale for ${sku}.` })
    }
    rows.push({ line, values })
  }
  if (!rows.length && !issues.some(x => x.level === 'error')) issues.push({ line: 1, level: 'error', message: 'No data rows found.' })
  return { rows, issues, skipped }
}

export const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'ITEM'
