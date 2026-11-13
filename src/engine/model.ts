// Pricing engine: unit cost roll-up, strategy pricing, per-channel contribution, checks and order economics.
// Money is in dollars as floats; every displayed figure is rounded at the edge, never mid-calculation,
// except price points, which are real prices and are rounded to cents.

export interface Component {
  id: string
  name: string
  kind: 'material' | 'packaging'
  /** Cost of one unit of this component, e.g. one jar, one gram of wax. */
  unitCost: number
  unit: string
}

export interface BomLine { componentId: string; qty: number }

export interface Product {
  id: string
  sku: string
  name: string
  category?: string
  /** Shared components (bill of materials). */
  bom: BomLine[]
  /** Flat per-unit costs not modelled as components (typical straight from a cost sheet). */
  materials: number
  packaging: number
  labourMinutes: number
  /** Per-unit overhead override; when unset the project allocation applies. */
  overhead?: number
  /** Current prices from the catalog import (or adopted proposals). */
  wholesale?: number
  msrp?: number
  /** Price the brand currently charges on its own site and on Etsy, for the MAP check. */
  dtcPrice?: number
  etsyPrice?: number
  competitorMsrp?: number
  caseSize: number
  moq: number
  /** Relative share of units in a typical wholesale order (defaults to 1). */
  mixWeight?: number
}

export type Rounding = 'none' | 'whole' | 'half' | 'charm'
export type Strategy =
  | { kind: 'keystone'; multiple: number }
  | { kind: 'margin'; target: number }
  | { kind: 'anchor' }

export type ChannelId = 'dtc' | 'etsy' | 'faireNew' | 'faireReorder' | 'faireDirect' | 'direct'
export const CHANNELS: ChannelId[] = ['dtc', 'etsy', 'faireNew', 'faireReorder', 'faireDirect', 'direct']
export const CHANNEL_LABEL: Record<ChannelId, string> = {
  dtc: 'DTC (Shopify)', etsy: 'Etsy', faireNew: 'Faire, first order', faireReorder: 'Faire, reorder', faireDirect: 'Faire Direct', direct: 'Direct wholesale',
}
export const RETAIL_CHANNELS: ChannelId[] = ['dtc', 'etsy']

export interface ChannelFees {
  enabled: boolean
  /** Share of the sale price taken as commission or transaction fee. */
  commission: number
  /** Payment processing share of the order. */
  processing: number
  /** Fixed fee per order (allocated to a unit by its share of order value). */
  perOrder: number
  /** Fixed fee per unit sold (e.g. Etsy listing renewal). */
  perUnit: number
  /** Advertising fee share applied to a share of orders (Etsy Offsite Ads). */
  adsRate: number
  adsShare: number
  /** Extra per-unit cost borne only on this channel (DTC pick, pack and mailer). */
  fulfilment: number
  /** Typical order value on this channel, used to allocate per-order fees. */
  aov: number
}

export interface Settings {
  labourRate: number
  overheadMonthly: number
  unitsPerMonth: number
  strategy: Strategy
  /** Retailer markup from wholesale to MSRP. 2 = keystone. */
  retailMarkup: number
  rounding: Rounding
  fees: Record<ChannelId, ChannelFees>
  feesCheckedOn: string
  orderMinimum: number
  firstOrderValue: number
  reorderValue: number
  reorderRate: number
  reordersPerYear: number
  years: number
  terms: string
  /** Contribution margin below this share is flagged as thin. */
  thinMargin: number
}

export interface Tier {
  /** Component substitutions: original component id -> cheaper component id. */
  swaps: Record<string, string>
  labourCut: number
  /** Replace flat packaging with this per-unit amount (null keeps it). */
  packaging: number | null
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ---------------- Unit cost ----------------

export interface CostBreakdown { materials: number; packaging: number; labour: number; overhead: number; total: number }

export const overheadPerUnit = (s: Settings) => s.unitsPerMonth > 0 ? s.overheadMonthly / s.unitsPerMonth : 0

export function unitCost(p: Product, comps: Component[], s: Settings, tier?: Tier): CostBreakdown {
  const byId = new Map(comps.map(c => [c.id, c]))
  let materials = p.materials, packaging = tier && tier.packaging !== null ? tier.packaging : p.packaging
  for (const line of p.bom) {
    const c = byId.get(tier?.swaps[line.componentId] ?? line.componentId) ?? byId.get(line.componentId)
    if (!c) continue
    const v = c.unitCost * line.qty
    if (c.kind === 'packaging') packaging += v
    else materials += v
  }
  const labour = p.labourMinutes * (1 - (tier?.labourCut ?? 0)) / 60 * s.labourRate
  const overhead = p.overhead ?? overheadPerUnit(s)
  return { materials, packaging, labour, overhead, total: materials + packaging + labour + overhead }
}

// ---------------- Strategy pricing ----------------

/** Round a price up (or to nearest) onto a retail price point. */
export function pricePoint(x: number, mode: Rounding, dir: 'up' | 'nearest' = 'up'): number {
  if (!(x > 0)) return 0
  const f = dir === 'up' ? Math.ceil : Math.round
  const eps = 1e-9
  switch (mode) {
    case 'none': return r2(x)
    case 'whole': return f(x - (dir === 'up' ? eps : 0))
    case 'half': return f(x * 2 - (dir === 'up' ? eps : 0)) / 2
    case 'charm': {
      // x.99 style: the next price ending in .99 (or nearest one).
      const c = f(x + 0.01 - (dir === 'up' ? eps : 0)) - 0.01
      return r2(Math.max(0.99, c))
    }
  }
}

export interface Proposal { wholesale: number; msrp: number; note?: string }

/** Wholesale from MSRP, rounded down to the cent so the retailer keeps at least the full markup ($15.99 / 2 = $7.99, not $8.00). */
export const wholesaleFor = (msrp: number, markup: number) => markup > 0 ? Math.floor(msrp / markup * 100 + 1e-6) / 100 : msrp

export function propose(p: Product, cost: number, s: Settings): Proposal {
  const st = s.strategy
  if (st.kind === 'anchor') {
    const anchor = p.competitorMsrp ?? p.dtcPrice ?? p.msrp
    if (!anchor) return { ...propose(p, cost, { ...s, strategy: { kind: 'keystone', multiple: 2 } }), note: 'No competitor price; fell back to keystone' }
    const msrp = pricePoint(anchor, s.rounding, 'nearest')
    return { msrp, wholesale: wholesaleFor(msrp, s.retailMarkup) }
  }
  const raw = st.kind === 'keystone' ? cost * st.multiple : cost / Math.max(0.01, 1 - st.target)
  const msrp = pricePoint(raw * s.retailMarkup, s.rounding, 'up')
  // Wholesale follows the rounded MSRP so retailers keep their markup exactly.
  return { msrp, wholesale: wholesaleFor(msrp, s.retailMarkup) }
}

export interface Prices { wholesale: number; msrp: number; source: 'current' | 'proposed' }
export function effectivePrices(p: Product, prop: Proposal, markup = 2): Prices {
  if (p.wholesale && p.msrp) return { wholesale: p.wholesale, msrp: p.msrp, source: 'current' }
  if (p.wholesale) return { wholesale: p.wholesale, msrp: r2(p.wholesale * markup), source: 'current' }
  return { wholesale: prop.wholesale, msrp: prop.msrp, source: 'proposed' }
}

// ---------------- Channel contribution ----------------

export interface ChannelResult {
  channel: ChannelId
  price: number
  commission: number
  processing: number
  orderFees: number
  unitFees: number
  ads: number
  fulfilment: number
  fees: number
  cost: number
  contribution: number
  margin: number
}

export function channelPrice(ch: ChannelId, p: Product, prices: Prices): number {
  if (ch === 'dtc') return p.dtcPrice ?? prices.msrp
  if (ch === 'etsy') return p.etsyPrice ?? p.dtcPrice ?? prices.msrp
  return prices.wholesale
}

export function channelResult(ch: ChannelId, price: number, cost: number, f: ChannelFees): ChannelResult {
  const commission = price * f.commission
  const processing = price * f.processing
  // A fixed per-order fee lands on each unit in proportion to its share of the order's value.
  const orderFees = f.aov > 0 ? f.perOrder * price / f.aov : 0
  const unitFees = f.perUnit
  const ads = price * f.adsRate * f.adsShare
  const fees = commission + processing + orderFees + unitFees + ads + f.fulfilment
  const contribution = price - fees - cost
  return { channel: ch, price, commission, processing, orderFees, unitFees, ads, fulfilment: f.fulfilment, fees, cost, contribution, margin: price > 0 ? contribution / price : 0 }
}

// ---------------- Checks ----------------

export type Severity = 'loss' | 'warn' | 'info'
export interface Issue { sku: string; severity: Severity; code: string; message: string }

export function checks(p: Product, prices: Prices, rows: ChannelResult[], s: Settings): Issue[] {
  const out: Issue[] = []
  const add = (severity: Severity, code: string, message: string) => out.push({ sku: p.sku, severity, code, message })
  const by = (c: ChannelId) => rows.find(r => r.channel === c)
  const first = by('faireNew')
  if (first && first.contribution < 0) add('loss', 'faire-first-loss', `Loses $${(-first.contribution).toFixed(2)} a unit on a first Faire order from a new retailer.`)
  for (const r of rows) {
    if (r.channel === 'faireNew') continue
    if (r.contribution < 0) add('loss', 'loss', `Loses money on ${CHANNEL_LABEL[r.channel]}.`)
    else if (r.margin < s.thinMargin) add('warn', 'thin', `Contribution margin on ${CHANNEL_LABEL[r.channel]} is only ${(r.margin * 100).toFixed(0)}%.`)
  }
  if (first && first.contribution >= 0 && first.margin < s.thinMargin) add('warn', 'thin', `Contribution margin on a first Faire order is only ${(first.margin * 100).toFixed(0)}%.`)
  // MAP / MSRP consistency: retailers will not stock you if you undercut them online.
  if (s.fees.dtc.enabled && p.dtcPrice !== undefined && p.dtcPrice < prices.msrp - 0.005) add('warn', 'map-dtc', `Your site sells at $${p.dtcPrice.toFixed(2)}, below the $${prices.msrp.toFixed(2)} MSRP you give retailers.`)
  if (s.fees.etsy.enabled && p.etsyPrice !== undefined && p.etsyPrice < prices.msrp - 0.005) add('warn', 'map-etsy', `Etsy price $${p.etsyPrice.toFixed(2)} undercuts the $${prices.msrp.toFixed(2)} MSRP.`)
  if (p.dtcPrice !== undefined && p.dtcPrice > prices.msrp * 1.25) add('info', 'map-high', `Your site price is ${((p.dtcPrice / prices.msrp - 1) * 100).toFixed(0)}% above MSRP, so stockists look cheap next to you.`)
  if (prices.wholesale > 0 && prices.msrp / prices.wholesale < 1.999) add('warn', 'markup', `Retailers get a ${(prices.msrp / prices.wholesale).toFixed(2)}× markup; most expect keystone (2×) or more.`)
  if (p.moq > 0 && p.caseSize > 1 && p.moq % p.caseSize !== 0) add('info', 'moq-case', `MOQ ${p.moq} is not a multiple of the case size ${p.caseSize}.`)
  return out
}

// ---------------- Whole catalog ----------------

export interface ProductResult {
  product: Product
  cost: CostBreakdown
  proposal: Proposal
  prices: Prices
  channels: ChannelResult[]
  issues: Issue[]
}

export function analyse(products: Product[], comps: Component[], s: Settings, tier?: Tier): ProductResult[] {
  return products.map(p => {
    const cost = unitCost(p, comps, s, tier)
    const proposal = propose(p, cost.total, s)
    const prices = effectivePrices(p, proposal, s.retailMarkup)
    const channels = CHANNELS.filter(c => s.fees[c].enabled).map(c => channelResult(c, channelPrice(c, p, prices), cost.total, s.fees[c]))
    return { product: p, cost, proposal, prices, channels, issues: checks(p, prices, channels, s) }
  })
}

// ---------------- Order minimums, MOQ and retailer lifetime value ----------------

export interface OrderEconomics {
  /** Mix-weighted cost as a share of wholesale. */
  costRatio: number
  firstProfit: number
  reorderProfit: number
  /** Smallest first order that does not lose money. */
  breakEvenFirstOrder: number
  /** Profit on an order exactly at the minimum. */
  minimumOrderProfit: number
  /** Expected profit from one new retailer over the horizon (reorders weighted by probability). */
  lifetimeValue: number
  /** Expected cumulative profit after each order (index 0 = first order). */
  curve: number[]
  /** Order number (1-based reorder count) at which expected cumulative profit turns positive; 0 if the first order already pays, null if never within the horizon. */
  paybackReorder: number | null
  /** Smallest value a retailer can order when buying the MOQ of one SKU. */
  smallestMoqLine: number
}

export function orderProfit(value: number, costRatio: number, f: ChannelFees) {
  return value * (1 - f.commission - f.processing - costRatio) - f.perOrder
}

export function orderEconomics(results: ProductResult[], s: Settings): OrderEconomics {
  let w = 0, c = 0
  for (const r of results) {
    const k = r.product.mixWeight ?? 1
    w += k * r.prices.wholesale
    c += k * r.cost.total
  }
  const costRatio = w > 0 ? c / w : 0
  const fn = s.fees.faireNew, fr = s.fees.faireReorder
  const firstValue = Math.max(s.firstOrderValue, s.orderMinimum)
  const firstProfit = orderProfit(firstValue, costRatio, fn)
  const reorderProfit = orderProfit(s.reorderValue, costRatio, fr)
  const unitMargin = 1 - fn.commission - fn.processing - costRatio
  const breakEvenFirstOrder = unitMargin > 0 ? fn.perOrder / unitMargin : Infinity
  const n = Math.max(0, Math.round(s.reordersPerYear * s.years))
  const curve = [firstProfit]
  let p = 1
  for (let i = 1; i <= n; i++) { p *= s.reorderRate; curve.push(curve[i - 1] + p * reorderProfit) }
  const idx = curve.findIndex(v => v >= -1e-9)
  const lines = results.filter(r => r.product.moq > 0).map(r => r.product.moq * r.prices.wholesale)
  return {
    costRatio, firstProfit, reorderProfit, breakEvenFirstOrder,
    minimumOrderProfit: orderProfit(s.orderMinimum, costRatio, fn),
    lifetimeValue: curve[curve.length - 1],
    curve,
    paybackReorder: idx < 0 ? null : idx,
    smallestMoqLine: lines.length ? Math.min(...lines) : 0,
  }
}

// ---------------- Snapshots and compare ----------------

export interface SnapshotRow { sku: string; name: string; cost: number; wholesale: number; msrp: number; cm: Partial<Record<ChannelId, number>> }
export interface Snapshot {
  id: string
  label: string
  at: number
  rows: SnapshotRow[]
  fees: Record<ChannelId, ChannelFees>
  labourRate: number
}

export function snapshotRows(results: ProductResult[]): SnapshotRow[] {
  return results.map(r => ({
    sku: r.product.sku, name: r.product.name, cost: r2(r.cost.total), wholesale: r.prices.wholesale, msrp: r.prices.msrp,
    cm: Object.fromEntries(r.channels.map(c => [c.channel, Math.round(c.margin * 1000) / 1000])),
  }))
}

export interface DiffRow {
  sku: string
  name: string
  status: 'added' | 'removed' | 'changed' | 'same'
  cost: [number | null, number | null]
  wholesale: [number | null, number | null]
  cm: Partial<Record<ChannelId, [number | null, number | null]>>
}
export interface FeeChange { channel: ChannelId; field: keyof ChannelFees; from: number | boolean; to: number | boolean }

export function compareSnapshots(a: Pick<Snapshot, 'rows' | 'fees' | 'labourRate'>, b: Pick<Snapshot, 'rows' | 'fees' | 'labourRate'>) {
  const am = new Map(a.rows.map(r => [r.sku, r])), bm = new Map(b.rows.map(r => [r.sku, r]))
  const skus = [...new Set([...am.keys(), ...bm.keys()])]
  const rows: DiffRow[] = skus.map(sku => {
    const x = am.get(sku), y = bm.get(sku)
    const cm: DiffRow['cm'] = {}
    for (const ch of CHANNELS) {
      const u = x?.cm[ch], v = y?.cm[ch]
      if (u !== undefined || v !== undefined) cm[ch] = [u ?? null, v ?? null]
    }
    const changed = !!x && !!y && (x.cost !== y.cost || x.wholesale !== y.wholesale || x.msrp !== y.msrp || CHANNELS.some(c => x.cm[c] !== y.cm[c]))
    return {
      sku, name: (y ?? x)!.name, status: !x ? 'added' : !y ? 'removed' : changed ? 'changed' : 'same',
      cost: [x?.cost ?? null, y?.cost ?? null], wholesale: [x?.wholesale ?? null, y?.wholesale ?? null], cm,
    }
  })
  const fees: FeeChange[] = []
  for (const ch of CHANNELS) {
    const fa = a.fees[ch], fb = b.fees[ch]
    if (!fa || !fb) continue
    for (const k of Object.keys(fb) as (keyof ChannelFees)[]) if (fa[k] !== fb[k]) fees.push({ channel: ch, field: k, from: fa[k], to: fb[k] })
  }
  return { rows, fees, labour: a.labourRate !== b.labourRate ? [a.labourRate, b.labourRate] as const : null }
}
