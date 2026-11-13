// Merging imports into a catalog, and the files a brand uploads back to Shopify and Faire.
import { slug, toCsv, type Field, type ImportRow, type Kind } from './csv.ts'
import { CHANNEL_LABEL, r2, type Component, type OrderEconomics, type Product, type ProductResult, type Settings } from './model.ts'

/** Shopify fields kept so the price update lands on the same product and variant: base title, Option1 name and value. */
export type CatalogProduct = Product & { handle?: string; title?: string; optionName?: string; optionValue?: string }

export interface MergeResult { products: CatalogProduct[]; components: Component[]; added: number; updated: number }

const num = (v: ImportRow['values'][Field]) => typeof v === 'number' ? v : undefined
const str = (v: ImportRow['values'][Field]) => v === undefined ? undefined : String(v)

export function blankProduct(sku: string, name: string, id: string): CatalogProduct {
  return { id, sku, name, bom: [], materials: 0, packaging: 0, labourMinutes: 0, caseSize: 1, moq: 1 }
}

export function mergeImport(products: CatalogProduct[], components: Component[], kind: Kind, rows: ImportRow[], settings: Settings, newId: () => string): MergeResult {
  const list = products.map(p => ({ ...p, bom: [...p.bom] }))
  const comps = [...components]
  const bySku = new Map(list.map(p => [p.sku.toLowerCase(), p]))
  let added = 0, updated = 0
  for (const { values: v } of rows) {
    const sku = String(v.sku)
    let p = bySku.get(sku.toLowerCase())
    if (!p) {
      if (kind === 'bom') { p = blankProduct(sku, sku, newId()) } else p = blankProduct(sku, str(v.name) ?? sku, newId())
      list.push(p); bySku.set(sku.toLowerCase(), p); added++
    } else updated++
    if (kind === 'bom') {
      const name = String(v.component)
      let c = comps.find(x => x.name.toLowerCase() === name.toLowerCase())
      if (!c) {
        const k = String(v.componentKind ?? '').toLowerCase()
        c = { id: newId(), name, kind: /pack|box|label|tissue|bag|mailer/.test(k + ' ' + name.toLowerCase()) ? 'packaging' : 'material', unitCost: num(v.unitCost) ?? 0, unit: str(v.unit) ?? 'each' }
        comps.push(c)
      } else if (num(v.unitCost) !== undefined) {
        const i = comps.indexOf(c); c = { ...c, unitCost: num(v.unitCost)! }; comps[i] = c
      }
      const cid = c.id
      const existing = p.bom.find(l => l.componentId === cid)
      if (existing) existing.qty = num(v.qty) ?? existing.qty
      else p.bom.push({ componentId: cid, qty: num(v.qty) ?? 1 })
      continue
    }
    if (str(v.name)) p.name = str(v.name)!
    if (kind === 'shopify') {
      const opt = str(v.optionValue)
      if (str(v.name)) p.title = str(v.name)
      if (opt && opt !== 'Default Title') { p.optionName = str(v.optionName) ?? 'Option'; p.optionValue = opt; if (p.title) p.name = `${p.title} - ${opt}` }
    }
    if (str(v.category)) p.category = str(v.category)
    if (str(v.handle)) p.handle = str(v.handle)
    if (kind === 'etsy') { if (num(v.price) !== undefined) p.etsyPrice = num(v.price) }
    else if (num(v.price) !== undefined) p.dtcPrice = num(v.price)
    if (num(v.wholesale) !== undefined) p.wholesale = num(v.wholesale)
    if (num(v.msrp) !== undefined && num(v.msrp)! > 0) p.msrp = num(v.msrp)
    if (num(v.moq) !== undefined) p.moq = Math.max(1, Math.round(num(v.moq)!))
    if (num(v.caseSize) !== undefined) p.caseSize = Math.max(1, Math.round(num(v.caseSize)!))
    if (num(v.competitorMsrp) !== undefined) p.competitorMsrp = num(v.competitorMsrp)
    if (kind === 'costsheet') {
      p.materials = num(v.materials) ?? p.materials
      p.packaging = num(v.packaging) ?? p.packaging
      p.labourMinutes = num(v.labourMinutes) ?? p.labourMinutes
      if (num(v.overhead) !== undefined) p.overhead = num(v.overhead)
      // A per-row labour rate different from the project's is folded into minutes so the roll-up stays exact.
      const rate = num(v.labourRate)
      if (rate && settings.labourRate > 0 && rate !== settings.labourRate) p.labourMinutes = r2(p.labourMinutes * rate / settings.labourRate)
    } else if (num(v.cost) !== undefined && p.materials === 0 && p.bom.length === 0 && p.labourMinutes === 0) {
      // A single "cost per item" lands in materials until the cost sheet breaks it down.
      p.materials = num(v.cost)!
    }
  }
  return { products: list, components: comps, added, updated }
}

// ---------------- Outputs ----------------

/** Shopify product CSV in overwrite shape: Handle plus the price columns being changed. Columns checked 2026-11-08. */
export function shopifyPriceCsv(results: ProductResult[]): string {
  const rows: (string | number)[][] = [['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Cost per item']]
  const seen = new Set<string>()
  for (const r of results) {
    const p = r.product as CatalogProduct
    const handle = p.handle ?? slug(p.name).toLowerCase()
    // Shopify takes the title from a handle's first row; later variant rows leave it blank.
    const title = seen.has(handle) ? '' : p.title ?? p.name
    seen.add(handle)
    rows.push([handle, title, p.optionName ?? 'Title', p.optionValue ?? 'Default Title', p.sku, r.prices.msrp.toFixed(2), '', r2(r.cost.total).toFixed(2)])
  }
  return toCsv(rows)
}

/** Faire bulk product sheet shape (price columns only). Columns checked 2026-11-08 against the template brands download from the portal. */
export function fairePriceCsv(results: ProductResult[]): string {
  const rows: (string | number)[][] = [['Product Name (English)', 'SKU', 'Wholesale Price (USD)', 'Retail Price (USD)', 'Minimum Order Quantity', 'Case Size']]
  for (const r of results) rows.push([r.product.name, r.product.sku, r.prices.wholesale.toFixed(2), r.prices.msrp.toFixed(2), r.product.moq, r.product.caseSize])
  return toCsv(rows)
}

const usd = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number) => `${(n * 100).toFixed(0)}%`

/** Plain-text pricing rationale; the printable page renders the same facts. */
export function rationaleText(brand: string, results: ProductResult[], s: Settings, econ: OrderEconomics): string {
  const st = s.strategy
  const how = st.kind === 'keystone' ? `wholesale at ${st.multiple}× fully loaded unit cost` : st.kind === 'margin' ? `wholesale set for a ${pct(st.target)} gross margin on fully loaded cost` : 'MSRP anchored to comparable products, wholesale at MSRP ÷ retail markup'
  const lines = [
    `${brand}: pricing rationale`,
    '',
    `Method: ${how}; MSRP = wholesale × ${s.retailMarkup}, rounded to ${s.rounding === 'charm' ? '.99 price points' : s.rounding === 'whole' ? 'whole dollars' : s.rounding === 'half' ? '50-cent steps' : 'the cent'}.`,
    `Unit cost includes materials, packaging, labour at ${usd(s.labourRate)}/hr and overhead of ${usd(s.unitsPerMonth > 0 ? s.overheadMonthly / s.unitsPerMonth : 0)} a unit.`,
    `Fees as of ${s.feesCheckedOn}. Faire first order ${pct(s.fees.faireNew.commission)} + ${pct(s.fees.faireNew.processing)} processing + ${usd(s.fees.faireNew.perOrder)} per order; reorders ${pct(s.fees.faireReorder.commission)}.`,
    '',
    'SKU, cost, wholesale, MSRP, ' + results[0]?.channels.map(c => CHANNEL_LABEL[c.channel]).join(', '),
    ...results.map(r => [r.product.sku, usd(r.cost.total), usd(r.prices.wholesale), usd(r.prices.msrp), ...r.channels.map(c => pct(c.margin))].join(', ')),
    '',
    `Order minimum ${usd(s.orderMinimum)}; a first Faire order breaks even at ${Number.isFinite(econ.breakEvenFirstOrder) ? usd(econ.breakEvenFirstOrder) : 'no size'}.`,
    `Expected value of a new retailer over ${s.years} years at a ${pct(s.reorderRate)} reorder rate: ${usd(econ.lifetimeValue)}.`,
  ]
  return lines.join('\n')
}
