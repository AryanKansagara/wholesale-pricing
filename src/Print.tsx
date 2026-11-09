import { useEffect } from 'react'
import { CHANNEL_LABEL, overheadPerUnit, type ProductResult } from './engine/model.ts'
import { useAnalysis, useProject } from './projectData.ts'
import { fmtPct, fmtUsd, Link } from './ui.tsx'

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)

export default function PrintPage({ id, kind }: { id: string; kind: string }) {
  const p = useProject(id)
  const a = useAnalysis(p)
  useEffect(() => { if (p) document.title = `${p.name} · ${kind === 'linesheet' ? 'Wholesale line sheet' : 'Pricing rationale'}` }, [p?.name, kind])
  if (p === null || !a) return <div className="boot" role="status"><span className="spinner" /> Preparing</div>
  if (!p) return <div className="page narrow center"><h1>Brand not found</h1><Link href="/app">Back to brands</Link></div>
  const season = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <div className="print-shell">
      <div className="print-toolbar no-print">
        <Link href={`/app/p/${id}/actions`} className="btn ghost sm">← Back</Link>
        <span className="muted small">Use your browser's print dialog and choose “Save as PDF”. Letter or A4, margins default.</span>
        <button type="button" className="btn primary sm" onClick={() => print()}>Print / Save PDF</button>
      </div>
      {kind === 'linesheet' ? <LineSheet p={p} results={a.results} season={season} /> : <Rationale p={p} a={a} season={season} />}
    </div>
  )
}

type P = NonNullable<ReturnType<typeof useProject>>

function LineSheet({ p, results, season }: { p: P; results: ProductResult[]; season: string }) {
  const groups = new Map<string, ProductResult[]>()
  for (const r of results) { const k = r.product.category || 'Collection'; groups.set(k, [...(groups.get(k) ?? []), r]) }
  const s = p.settings
  return (
    <article className="sheet">
      <section className="sheet-page cover">
        <div className="cover-top"><span className="cover-mark">{p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2)}</span><span>Wholesale · {season}</span></div>
        <div>
          <h1>{p.name}</h1>
          {p.brand.tagline && <p className="cover-tag">{p.brand.tagline}</p>}
        </div>
        <dl className="cover-terms">
          <div><dt>Opening order minimum</dt><dd>{fmtUsd(s.orderMinimum, 0)}</dd></div>
          <div><dt>Reorder minimum</dt><dd>{fmtUsd(Math.min(s.orderMinimum, 100), 0)}</dd></div>
          <div><dt>Lead time</dt><dd>{p.brand.leadTime}</dd></div>
          <div><dt>Terms</dt><dd>{s.terms}</dd></div>
          {p.brand.email && <div><dt>Orders</dt><dd>{p.brand.email}</dd></div>}
          {p.brand.website && <div><dt>Web</dt><dd>{p.brand.website}</dd></div>}
        </dl>
        <p className="cover-note">Prices in USD. MSRP is the suggested retail price; we sell at MSRP on our own site and never below it. Also available on Faire.</p>
      </section>
      {[...groups].map(([cat, rs]) => (
        <section key={cat} className="sheet-page">
          <header className="sheet-head"><h2>{cat}</h2><span>{p.name} · {season}</span></header>
          <div className="sheet-grid">
            {rs.map(r => (
              <div key={r.product.id} className="tile">
                <div className="swatch" style={{ ['--h' as string]: hue(r.product.name) }} aria-hidden="true"><span>{r.product.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</span></div>
                <b>{r.product.name}</b>
                <span className="mono">{r.product.sku}</span>
                <div className="tile-prices"><span>Wholesale <b>{fmtUsd(r.prices.wholesale)}</b></span><span>MSRP <b>{fmtUsd(r.prices.msrp)}</b></span></div>
                <span className="small">Case of {r.product.caseSize} · MOQ {r.product.moq}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="sheet-page order-form">
        <header className="sheet-head"><h2>Order form</h2><span>{p.name} · {season}</span></header>
        <div className="form-lines">
          {['Store name', 'Contact', 'Email', 'Phone', 'Ship to', 'Requested ship date'].map(l => <div key={l}><span>{l}</span><i /></div>)}
        </div>
        <table className="of-table">
          <thead><tr><th>SKU</th><th>Product</th><th className="num">Wholesale</th><th className="num">Case</th><th className="num">MOQ</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
          <tbody>{results.map(r => <tr key={r.product.id}><td className="mono">{r.product.sku}</td><td>{r.product.name}</td><td className="num">{fmtUsd(r.prices.wholesale)}</td><td className="num">{r.product.caseSize}</td><td className="num">{r.product.moq}</td><td /><td /></tr>)}</tbody>
          <tfoot><tr><td colSpan={5}>Opening orders {fmtUsd(s.orderMinimum, 0)} minimum. Quantities in multiples of the case size.</td><td className="num">Total</td><td /></tr></tfoot>
        </table>
        <p className="small">{s.terms}</p>
      </section>
    </article>
  )
}

function Rationale({ p, a, season }: { p: P; a: NonNullable<ReturnType<typeof useAnalysis>>; season: string }) {
  const s = p.settings, st = s.strategy, e = a.econ
  const chans = a.results[0]?.channels.map(c => c.channel) ?? []
  const flags = a.results.flatMap(r => r.issues).filter(i => i.severity !== 'info')
  return (
    <article className="sheet rationale">
      <section className="sheet-page">
        <header className="sheet-head"><h2>{p.name}: pricing rationale</h2><span>{season}</span></header>
        <div className="rat-grid">
          <div><h3>Method</h3><p>{st.kind === 'keystone' ? `Wholesale at ${st.multiple}× fully loaded unit cost.` : st.kind === 'margin' ? `Wholesale set so every SKU earns at least a ${fmtPct(st.target)} gross margin on fully loaded cost.` : 'MSRP anchored to comparable products; wholesale follows.'} MSRP is wholesale × {s.retailMarkup}, rounded {s.rounding === 'charm' ? 'up to .99' : s.rounding === 'whole' ? 'up to whole dollars' : s.rounding === 'half' ? 'up to 50 cents' : 'to the cent'}, so retailers keep a {s.retailMarkup}× markup.</p></div>
          <div><h3>Cost basis</h3><p>Materials and packaging from the bill of materials, labour at {fmtUsd(s.labourRate)}/hr, overhead of {fmtUsd(overheadPerUnit(s))} a unit ({fmtUsd(s.overheadMonthly, 0)} a month over {s.unitsPerMonth} units).</p></div>
          <div><h3>Fees (as of {s.feesCheckedOn})</h3><p>Faire first order {fmtPct(s.fees.faireNew.commission)} + {fmtPct(s.fees.faireNew.processing, 1)} processing + {fmtUsd(s.fees.faireNew.perOrder, 0)}; reorders {fmtPct(s.fees.faireReorder.commission)}; Faire Direct {fmtPct(s.fees.faireDirect.commission)}. Etsy {fmtPct(s.fees.etsy.commission, 1)} + {fmtPct(s.fees.etsy.processing)} + {fmtUsd(s.fees.etsy.perOrder)}.</p></div>
          <div><h3>Order economics</h3><p>A first order breaks even at {Number.isFinite(e.breakEvenFirstOrder) ? fmtUsd(e.breakEvenFirstOrder, 0) : 'no size'}; at the {fmtUsd(s.orderMinimum, 0)} minimum it makes {fmtUsd(e.minimumOrderProfit)}. A new retailer is worth {fmtUsd(e.lifetimeValue, 0)} over {s.years} years at a {fmtPct(s.reorderRate)} reorder rate.</p></div>
        </div>
        <table className="of-table">
          <thead><tr><th>SKU</th><th className="num">Cost</th><th className="num">Wholesale</th><th className="num">MSRP</th>{chans.map(c => <th key={c} className="num">{CHANNEL_LABEL[c]}</th>)}</tr></thead>
          <tbody>{a.results.map(r => <tr key={r.product.id}><td className="mono">{r.product.sku}</td><td className="num">{fmtUsd(r.cost.total)}</td><td className="num">{fmtUsd(r.prices.wholesale)}</td><td className="num">{fmtUsd(r.prices.msrp)}</td>{r.channels.map(c => <td key={c.channel} className={`num${c.contribution < 0 ? ' neg' : ''}`}>{fmtPct(c.margin)}</td>)}</tr>)}</tbody>
        </table>
        <p className="small muted">Percentages are contribution margin per unit: price minus channel fees and fully loaded unit cost, over price.</p>
        {flags.length > 0 && <><h3>Open issues</h3><ul className="rat-flags">{flags.slice(0, 12).map((i, k) => <li key={k}><b className="mono">{i.sku}</b> {i.message}</li>)}</ul></>}
      </section>
    </article>
  )
}
