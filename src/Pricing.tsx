import { useMemo } from 'react'
import { LtvChart, marginTone, NumInput } from './charts.tsx'
import { defaultFees, FEES_CHECKED } from './engine/fees.ts'
import { analyse, CHANNEL_LABEL, CHANNELS, type ChannelFees, type ChannelId, type Rounding, type Strategy } from './engine/model.ts'
import { useAnalysis } from './projectData.ts'
import type { TabProps } from './Project.tsx'
import { Empty, fmtPct, fmtUsd, Link, signed, toast } from './ui.tsx'

export default function Pricing(props: TabProps & { tab: 'pricing' | 'channels' | 'orders' | 'tier' }) {
  if (!props.p.products.length) return <Empty title="No products yet"><Link href={`/app/p/${props.p.id}/import`} className="btn primary">Import your catalog</Link></Empty>
  if (props.tab === 'pricing') return <StrategyTab {...props} />
  if (props.tab === 'channels') return <ChannelsTab {...props} />
  if (props.tab === 'orders') return <OrdersTab {...props} />
  return <TierTab {...props} />
}

const Delta = ({ a, b, pct }: { a: number; b: number; pct?: boolean }) => {
  const d = b - a
  if (Math.abs(d) < 0.005) return <span className="muted">—</span>
  return <span className={d > 0 ? 'up' : 'down'}>{signed(d, x => pct ? `${(x * 100).toFixed(0)} pts` : fmtUsd(x))}</span>
}

// ---------------- Strategy ----------------

function StrategyTab({ p, update, setS }: TabProps) {
  const s = p.settings
  const cur = useAnalysis(p)!
  const proposed = useMemo(() => analyse(p.products.map(x => ({ ...x, wholesale: undefined, msrp: undefined })), p.components, s), [p, s])
  const setStrategy = (st: Strategy) => setS({ strategy: st })
  const adopt = (ids?: string[]) => {
    const before = p.products
    const map = new Map(proposed.map(r => [r.product.id, r.proposal]))
    update({ products: p.products.map(x => !ids || ids.includes(x.id) ? { ...x, wholesale: map.get(x.id)!.wholesale, msrp: map.get(x.id)!.msrp } : x) })
    toast(ids ? 'Adopted the proposed price' : `Adopted proposed prices for ${p.products.length} SKUs`, { undo: () => update({ products: before }) })
  }
  const st = s.strategy
  const changed = proposed.filter((r, i) => r.proposal.wholesale !== cur.results[i].prices.wholesale || r.proposal.msrp !== cur.results[i].prices.msrp)
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Strategy</h2><span className="muted small">Proposals use fully loaded unit cost</span></div>
        <div className="strategy-cards" role="radiogroup" aria-label="Pricing strategy">
          {([['keystone', 'Keystone', 'Wholesale at a multiple of cost (2× is the classic), MSRP at wholesale × retail markup.'], ['margin', 'Target margin', 'Wholesale that guarantees your gross margin on every SKU, after rounding.'], ['anchor', 'Competitor anchor', 'Start from what comparable products retail for; wholesale follows MSRP.']] as const).map(([k, l, d]) => (
            <button key={k} type="button" role="radio" aria-checked={st.kind === k} className={`strategy${st.kind === k ? ' on' : ''}`} onClick={() => setStrategy(k === 'keystone' ? { kind: 'keystone', multiple: 2 } : k === 'margin' ? { kind: 'margin', target: 0.5 } : { kind: 'anchor' })}>
              <b>{l}</b><span>{d}</span>
            </button>
          ))}
        </div>
        <div className="controls flat">
          {st.kind === 'keystone' && <label className="ctl">Cost multiple<NumInput label="Cost multiple" step={0.1} min={1} value={st.multiple} onChange={v => setStrategy({ kind: 'keystone', multiple: v ?? 2 })} suffix="×" /></label>}
          {st.kind === 'margin' && <label className="ctl">Target gross margin<NumInput label="Target gross margin" pct step={1} max={0.95} value={st.target} onChange={v => setStrategy({ kind: 'margin', target: v ?? 0.5 })} /></label>}
          {st.kind === 'anchor' && <p className="muted small ctl grow">Set a competitor MSRP per SKU in the Catalog (click a row) or import a cost sheet with a <code>competitor msrp</code> column. SKUs without one use your site price, then keystone.</p>}
          <label className="ctl">Retail markup<NumInput label="Retail markup" step={0.1} min={1} value={s.retailMarkup} onChange={v => setS({ retailMarkup: v ?? 2 })} suffix="×" /></label>
          <label className="ctl">Round MSRP to
            <select value={s.rounding} onChange={e => setS({ rounding: e.target.value as Rounding })}>
              <option value="whole">Whole dollars ($18)</option><option value="half">50 cents ($17.50)</option><option value="charm">Charm ($17.99)</option><option value="none">Exact cents</option>
            </select>
          </label>
          <label className="ctl">Flag margins under<NumInput label="Thin margin threshold" pct step={1} value={s.thinMargin} onChange={v => setS({ thinMargin: v ?? 0.15 })} /></label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Current vs proposed</h2>
          <button type="button" className="btn primary sm" disabled={!changed.length} onClick={() => adopt()}>{changed.length ? `Adopt ${changed.length} proposed price${changed.length > 1 ? 's' : ''}` : 'Prices match the strategy'}</button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>SKU</th><th className="num">Unit cost</th><th className="num">Wholesale now</th><th className="num">Proposed</th><th className="num">MSRP now</th><th className="num">Proposed</th><th className="num">First Faire order CM</th><th /></tr></thead>
            <tbody>
              {proposed.map((r, i) => {
                const c = cur.results[i]
                const a = c.channels.find(x => x.channel === 'faireNew'), b = r.channels.find(x => x.channel === 'faireNew')
                const same = r.proposal.wholesale === c.prices.wholesale && r.proposal.msrp === c.prices.msrp
                return (
                  <tr key={r.product.id}>
                    <td><span className="mono">{r.product.sku}</span><div className="muted small">{r.product.name}</div></td>
                    <td className="num">{fmtUsd(r.cost.total)}</td>
                    <td className="num">{fmtUsd(c.prices.wholesale)}</td>
                    <td className="num strong">{fmtUsd(r.proposal.wholesale)} <small><Delta a={c.prices.wholesale} b={r.proposal.wholesale} /></small></td>
                    <td className="num">{fmtUsd(c.prices.msrp)}</td>
                    <td className="num strong">{fmtUsd(r.proposal.msrp)}</td>
                    <td className="num">{a && b ? <><span className={`pill ${marginTone(a.margin, s.thinMargin)}`}>{fmtPct(a.margin)}</span> → <span className={`pill ${marginTone(b.margin, s.thinMargin)}`}>{fmtPct(b.margin)}</span></> : '—'}</td>
                    <td className="num">{!same && <button type="button" className="btn ghost sm" onClick={() => adopt([r.product.id])}>Adopt</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {proposed.some(r => r.proposal.note) && <p className="muted small">Some SKUs had no competitor price and fell back to keystone.</p>}
      </div>
    </div>
  )
}

// ---------------- Channels and fees ----------------

const FIELDS: { k: keyof ChannelFees; label: string; pct?: boolean; money?: boolean }[] = [
  { k: 'commission', label: 'Commission', pct: true }, { k: 'processing', label: 'Processing', pct: true },
  { k: 'perOrder', label: 'Per order', money: true }, { k: 'perUnit', label: 'Per unit', money: true },
  { k: 'adsRate', label: 'Ads fee', pct: true }, { k: 'adsShare', label: 'Orders with ads', pct: true },
  { k: 'fulfilment', label: 'Pick & pack / unit', money: true }, { k: 'aov', label: 'Typical order', money: true },
]
const NOTES: Record<ChannelId, string> = {
  dtc: 'Shopify Payments, Basic plan. Fulfilment covers mailer and packing you pay for on retail orders.',
  etsy: 'Transaction 6.5%, Etsy Payments 3% + $0.25, $0.20 listing renewal per sale, Offsite Ads 15% on attributed orders.',
  faireNew: 'First order from a retailer Faire found for you. North America: 15% + a one-time $10. Outside North America add a 10% referral fee.',
  faireReorder: 'Repeat orders from marketplace retailers.',
  faireDirect: 'Retailers you bring with your Faire Direct link: no commission, processing only.',
  direct: 'Wholesale invoiced directly (ACH or cheque). Add card fees if you take cards.',
}

function ChannelsTab({ p, setS }: TabProps) {
  const s = p.settings
  const a = useAnalysis(p)!
  const setFee = (c: ChannelId, patch: Partial<ChannelFees>) => setS({ fees: { ...s.fees, [c]: { ...s.fees[c], ...patch } } })
  const avg = (c: ChannelId) => { const xs = a.results.map(r => r.channels.find(x => x.channel === c)).filter(Boolean); return xs.length ? xs.reduce((t, x) => t + x!.margin, 0) / xs.length : null }
  const maxAbs = Math.max(0.01, ...CHANNELS.map(c => Math.abs(avg(c) ?? 0)))
  const intl = s.fees.faireNew.commission >= 0.25
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Average contribution margin by channel</h2><span className="muted small">Same SKUs, same costs; only the channel changes</span></div>
        <div className="hbars">
          {CHANNELS.filter(c => s.fees[c].enabled).map(c => { const v = avg(c) ?? 0; return (
            <div key={c} className="hbar">
              <span>{CHANNEL_LABEL[c]}</span>
              <div className="hbar-track"><i className={marginTone(v, s.thinMargin)} style={{ width: `${Math.abs(v) / maxAbs * 100}%` }} /></div>
              <b className={v < 0 ? 'bad' : ''}>{fmtPct(v)}</b>
            </div>
          ) })}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Fees</h2>
          <div className="row gap-sm wrap">
            <label className="check"><input type="checkbox" checked={intl} onChange={e => setFee('faireNew', { commission: e.target.checked ? 0.25 : 0.15 })} /> Brand based outside North America</label>
            <label className="ctl inline">Checked on<input type="date" value={s.feesCheckedOn} onChange={e => setS({ feesCheckedOn: e.target.value })} /></label>
            <button type="button" className="btn ghost sm" onClick={() => { const before = s.fees; setS({ fees: defaultFees(), feesCheckedOn: FEES_CHECKED }); toast(`Fees reset to the ${FEES_CHECKED} defaults`, { undo: () => setS({ fees: before }) }) }}>Reset to defaults</button>
          </div>
        </div>
        <p className="muted small">Defaults were checked on {FEES_CHECKED}. Marketplaces change fees; the <Link href="/docs#fees">dated, sourced fee table</Link> shows where each number comes from. Edits apply to this brand only. Save a snapshot before and after a fee change to see what it did.</p>
        <div className="fee-grid">
          {CHANNELS.map(c => {
            const f = s.fees[c]
            return (
              <article key={c} className={`fee-card${f.enabled ? '' : ' off'}`}>
                <header>
                  <h3>{CHANNEL_LABEL[c]}</h3>
                  <label className="switch"><input type="checkbox" checked={f.enabled} onChange={e => setFee(c, { enabled: e.target.checked })} /><span aria-hidden="true" /><span className="sr">Sell on {CHANNEL_LABEL[c]}</span></label>
                </header>
                <p className="muted small">{NOTES[c]}</p>
                <div className="fee-fields">
                  {FIELDS.filter(x => (x.k !== 'adsRate' && x.k !== 'adsShare') || c === 'etsy' || f[x.k] !== 0).filter(x => x.k !== 'fulfilment' || c === 'dtc' || c === 'etsy' || f.fulfilment !== 0).map(x => (
                    <label key={x.k}><span>{x.label}</span><NumInput label={`${CHANNEL_LABEL[c]} ${x.label}`} pct={x.pct} prefix={x.money ? '$' : undefined} step={x.pct ? 0.5 : x.k === 'aov' ? 10 : 0.05} value={f[x.k] as number} onChange={v => setFee(c, { [x.k]: v ?? 0 })} /></label>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------- Order minimums and retailer LTV ----------------

function OrdersTab({ p, setS }: TabProps) {
  const s = p.settings
  const a = useAnalysis(p)!
  const e = a.econ
  const payback = e.paybackReorder === null ? `Not within ${s.years} years` : e.paybackReorder === 0 ? 'On the first order' : `After reorder ${e.paybackReorder}`
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Order assumptions</h2><span className="muted small">Faire first order vs reorders, using your catalog mix</span></div>
        <div className="controls flat">
          <label className="ctl">Order minimum<NumInput label="Order minimum" prefix="$" step={25} value={s.orderMinimum} onChange={v => setS({ orderMinimum: v ?? 0 })} /></label>
          <label className="ctl">Expected first order<NumInput label="Expected first order" prefix="$" step={10} value={s.firstOrderValue} onChange={v => setS({ firstOrderValue: v ?? 0 })} /></label>
          <label className="ctl">Typical reorder<NumInput label="Typical reorder" prefix="$" step={10} value={s.reorderValue} onChange={v => setS({ reorderValue: v ?? 0 })} /></label>
          <label className="ctl">Reorder rate<NumInput label="Chance a retailer reorders each time" pct step={5} max={1} value={s.reorderRate} onChange={v => setS({ reorderRate: v ?? 0 })} /></label>
          <label className="ctl">Reorders a year<NumInput label="Reorders per year" step={1} value={s.reordersPerYear} onChange={v => setS({ reordersPerYear: v ?? 0 })} /></label>
          <label className="ctl">Horizon<NumInput label="Years" step={1} min={1} max={10} value={s.years} onChange={v => setS({ years: v ?? 1 })} suffix="yr" /></label>
        </div>
      </div>
      <div className="kpis">
        <div className={`kpi ${e.firstProfit < 0 ? 'bad' : 'good'}`}><span>First order profit</span><b>{fmtUsd(e.firstProfit)}</b><small>on {fmtUsd(Math.max(s.firstOrderValue, s.orderMinimum), 0)} after {fmtPct(s.fees.faireNew.commission)} + {fmtUsd(s.fees.faireNew.perOrder, 0)}</small></div>
        <div className="kpi"><span>Break-even first order</span><b>{Number.isFinite(e.breakEvenFirstOrder) ? fmtUsd(e.breakEvenFirstOrder, 0) : 'Never'}</b><small>{s.orderMinimum < e.breakEvenFirstOrder ? `Your ${fmtUsd(s.orderMinimum, 0)} minimum is below it` : 'Your minimum covers it'}</small></div>
        <div className={`kpi ${e.minimumOrderProfit < 0 ? 'bad' : ''}`}><span>Order at the minimum</span><b>{fmtUsd(e.minimumOrderProfit)}</b><small>profit on a {fmtUsd(s.orderMinimum, 0)} first order</small></div>
        <div className="kpi"><span>Reorder profit</span><b>{fmtUsd(e.reorderProfit)}</b><small>each, at {fmtPct(s.fees.faireReorder.commission)} commission</small></div>
        <div className={`kpi ${e.lifetimeValue < 0 ? 'bad' : 'good'}`}><span>Retailer lifetime value</span><b>{fmtUsd(e.lifetimeValue, 0)}</b><small>expected over {s.years} yr · payback {payback.toLowerCase()}</small></div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>When does a new retailer pay back?</h2><span className="muted small">Expected cumulative profit; each reorder weighted by the chance the retailer is still ordering</span></div>
        <LtvChart curve={e.curve} />
        <p className="muted small">Blended cost is {fmtPct(e.costRatio)} of wholesale across your order mix. A first order loses money below {Number.isFinite(e.breakEvenFirstOrder) ? fmtUsd(e.breakEvenFirstOrder, 0) : 'any size'} because the one-time fee is fixed while commission scales. Raising the minimum shrinks the loss but also the number of retailers who try you; a reorder rate above {fmtPct(Math.max(0, Math.min(1, -e.firstProfit / Math.max(0.01, e.reorderProfit))))} on the first reorder alone covers it.</p>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>MOQ and case packs</h2><span className="muted small">The smallest line a retailer can add for each SKU</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>SKU</th><th className="num">Case</th><th className="num">MOQ</th><th className="num">Min line value</th><th className="num">First-order profit on that line</th><th className="num">Lines to hit the minimum</th></tr></thead>
            <tbody>
              {a.results.map(r => {
                const fn = r.channels.find(c => c.channel === 'faireNew')
                const line = r.product.moq * r.prices.wholesale
                return (
                  <tr key={r.product.id}>
                    <td><span className="mono">{r.product.sku}</span> <span className="muted small">{r.product.name}</span></td>
                    <td className="num">{r.product.caseSize}</td>
                    <td className="num">{r.product.moq}</td>
                    <td className="num">{fmtUsd(line)}</td>
                    <td className={`num ${fn && fn.contribution < 0 ? 'bad' : ''}`}>{fn ? fmtUsd(fn.contribution * r.product.moq) : '—'}</td>
                    <td className="num">{line > 0 ? Math.ceil(s.orderMinimum / line) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">The smallest possible line is {fmtUsd(e.smallestMoqLine)}. Line profit allocates the per-order fee by value, as in the catalog.</p>
      </div>
    </div>
  )
}

// ---------------- Wholesale tier simulator ----------------

function TierTab({ p, update }: TabProps) {
  const s = p.settings
  const base = useAnalysis(p)!
  const tier = useAnalysis(p, true)!
  const setTier = (patch: Partial<typeof p.tier>) => update({ tier: { ...p.tier, ...patch } })
  const used = new Set(p.products.flatMap(x => x.bom.map(l => l.componentId)))
  const fixed = base.results.filter((r, i) => r.issues.some(x => x.code === 'faire-first-loss') && !tier.results[i].issues.some(x => x.code === 'faire-first-loss'))
  const lostBefore = base.results.filter(r => r.issues.some(x => x.code === 'faire-first-loss')).length
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Design a wholesale tier</h2><span className="muted small">Same prices; cheaper to make. Nothing changes until you apply it.</span></div>
        <p className="muted">A common fix for thin handmade margins: a wholesale version with simpler packaging, a cheaper component or a faster batch process, sold at the same wholesale price.</p>
        <div className="tier-grid">
          {p.components.filter(c => used.has(c.id)).map(c => {
            const opts = p.components.filter(o => o.id !== c.id && o.kind === c.kind)
            if (!opts.length) return null
            return (
              <label key={c.id} className="field">
                <span>{c.name} <small className="muted">{fmtUsd(c.unitCost)}</small></span>
                <select value={p.tier.swaps[c.id] ?? ''} onChange={e => { const sw = { ...p.tier.swaps }; if (e.target.value) sw[c.id] = e.target.value; else delete sw[c.id]; setTier({ swaps: sw }) }}>
                  <option value="">Keep</option>
                  {opts.map(o => <option key={o.id} value={o.id}>Swap for {o.name} ({signed(o.unitCost - c.unitCost, x => fmtUsd(x))})</option>)}
                </select>
              </label>
            )
          })}
          <label className="field"><span>Batch labour saving: {Math.round(p.tier.labourCut * 100)}%</span><input type="range" min={0} max={60} step={5} value={Math.round(p.tier.labourCut * 100)} onChange={e => setTier({ labourCut: Number(e.target.value) / 100 })} /></label>
          <label className="field"><span>Replace flat packaging with</span><NumInput label="Tier flat packaging" prefix="$" value={p.tier.packaging ?? undefined} onChange={v => setTier({ packaging: v ?? null })} /></label>
        </div>
        <div className="row gap wrap tier-summary">
          <b>{fixed.length} of {lostBefore} first-order losers fixed.</b>
          <span className="muted">Average first-order margin {fmtPct(avgM(base.results))} → {fmtPct(avgM(tier.results))}</span>
          <button type="button" className="btn ghost sm" onClick={() => setTier({ swaps: {}, labourCut: 0, packaging: null })}>Clear tier</button>
          <button type="button" className="btn primary sm" disabled={!Object.keys(p.tier.swaps).length && !p.tier.labourCut && p.tier.packaging === null} onClick={() => {
            const before = { products: p.products, tier: p.tier }
            const products = p.products.map(x => ({ ...x, bom: x.bom.map(l => ({ ...l, componentId: p.tier.swaps[l.componentId] ?? l.componentId })), labourMinutes: Math.round(x.labourMinutes * (1 - p.tier.labourCut) * 100) / 100, packaging: p.tier.packaging ?? x.packaging }))
            update({ products, tier: { swaps: {}, labourCut: 0, packaging: null } })
            toast('Applied the tier to every recipe', { undo: () => update(before) })
          }}>Apply to recipes</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>SKU</th><th className="num">Unit cost</th><th className="num">Tier cost</th><th className="num">First order CM</th><th className="num">Tier</th><th className="num">Reorder CM</th><th className="num">Tier</th></tr></thead>
          <tbody>
            {base.results.map((r, i) => {
              const t = tier.results[i]
              const m = (x: typeof r, c: ChannelId) => x.channels.find(y => y.channel === c)
              const cell = (x: typeof r, c: ChannelId) => { const v = m(x, c); return v ? <span className={`pill ${marginTone(v.margin, s.thinMargin)}`}>{fmtPct(v.margin)}</span> : '—' }
              return (
                <tr key={r.product.id}>
                  <td><span className="mono">{r.product.sku}</span> <span className="muted small">{r.product.name}</span></td>
                  <td className="num">{fmtUsd(r.cost.total)}</td>
                  <td className="num strong">{fmtUsd(t.cost.total)} <small><Delta a={r.cost.total} b={t.cost.total} /></small></td>
                  <td className="num">{cell(r, 'faireNew')}</td><td className="num">{cell(t, 'faireNew')}</td>
                  <td className="num">{cell(r, 'faireReorder')}</td><td className="num">{cell(t, 'faireReorder')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const avgM = (rs: ReturnType<typeof analyse>) => { const xs = rs.map(r => r.channels.find(c => c.channel === 'faireNew')?.margin).filter((x): x is number => x !== undefined); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 }
