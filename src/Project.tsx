import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { MarginCell, NumInput, Waterfall } from './charts.tsx'
import { CHANNEL_LABEL, CHANNELS, type ChannelId, type Issue, type ProductResult, type Settings } from './engine/model.ts'
import type { CatalogProduct } from './engine/catalog.ts'
import { takeSnapshot, useAnalysis, useProject } from './projectData.ts'
import { saveProject, type Project } from './store.ts'
import { Empty, fmtPct, fmtUsd, go, isTyping, Link, Modal, SyntheticBadge, toast } from './ui.tsx'

const Costs = lazy(() => import('./Costs.tsx'))
const Pricing = lazy(() => import('./Pricing.tsx'))
const Actions = lazy(() => import('./Actions.tsx'))
const History = lazy(() => import('./History.tsx'))
const Import = lazy(() => import('./Import.tsx'))

export const TABS = [
  ['overview', 'Catalog'], ['costs', 'Costs & BOM'], ['pricing', 'Pricing'], ['channels', 'Channels & fees'], ['orders', 'Minimums & LTV'], ['tier', 'Wholesale tier'], ['actions', 'Line sheet & exports'], ['history', 'History'], ['import', 'Import'],
] as const
export type Tab = typeof TABS[number][0]

export interface TabProps { p: Project; update(patch: Partial<Project>): void; setS(patch: Partial<Settings>): void }

export default function ProjectView({ id, tab }: { id: string; tab: string }) {
  const p = useProject(id)
  const [help, setHelp] = useState(false)
  const t = (TABS.some(x => x[0] === tab) ? tab : 'overview') as Tab

  useEffect(() => { if (p) document.title = `${p.name} · ${TABS.find(x => x[0] === t)![1]} · Wholesale Ready` }, [p?.name, t])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || !p) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) { go(`/app/p/${id}/${TABS[n - 1][0]}`, { keepScroll: true }); return }
      if (e.key === 's') { void snap(p) }
      if (e.key === 'l') go(`/app/p/${id}/linesheet`)
      if (e.key === '?') setHelp(h => !h)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [id, p])

  if (p === null) return <div className="boot" role="status"><span className="spinner" /> Opening the brand</div>
  if (!p) return <section className="page narrow center notfound"><h1>Brand not found</h1><p className="muted">It may have been deleted, or it lives on another device you have not synced.</p><Link href="/app" className="btn primary">Back to brands</Link></section>

  const update = (patch: Partial<Project>) => void saveProject({ ...p, ...patch })
  const setS = (patch: Partial<Settings>) => update({ settings: { ...p.settings, ...patch } })
  const props: TabProps = { p, update, setS }

  return (
    <section className="page project">
      <div className="crumbs"><Link href="/app">Brands</Link><span aria-hidden="true">/</span><span>{p.name}</span></div>
      <div className="row between wrap gap">
        <div className="row gap-sm wrap"><h1 className="project-title">{p.name}</h1>{p.sampleId && <SyntheticBadge />}</div>
        <div className="row gap-sm">
          <button type="button" className="btn ghost sm" onClick={() => void snap(p)} title="Shortcut: S">Save snapshot</button>
          <Link href={`/app/p/${id}/linesheet`} className="btn primary sm" title="Shortcut: L">Line sheet</Link>
        </div>
      </div>
      <nav className="tabs" aria-label="Brand sections">
        {TABS.map(([k, l], i) => <Link key={k} href={`/app/p/${id}/${k}`} aria-current={k === t ? 'page' : undefined} title={`Shortcut: ${i + 1}`}>{l}</Link>)}
      </nav>
      <div className="tab-body" key={t}>
        <Suspense fallback={<div className="boot" role="status"><span className="spinner" /> Loading</div>}>
          {t === 'overview' && <Overview {...props} />}
          {t === 'costs' && <Costs {...props} />}
          {(t === 'pricing' || t === 'channels' || t === 'orders' || t === 'tier') && <Pricing {...props} tab={t} />}
          {t === 'actions' && <Actions {...props} />}
          {t === 'history' && <History {...props} />}
          {t === 'import' && <Import {...props} />}
        </Suspense>
      </div>
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <dl className="shortcuts">
          <div><dt><kbd>1</kbd>–<kbd>9</kbd></dt><dd>Switch sections</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Save a snapshot</dd></div>
          <div><dt><kbd>L</kbd></dt><dd>Open the line sheet</dd></div>
          <div><dt><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last delete or adopt</dd></div>
        </dl>
      </Modal>
    </section>
  )
}

async function snap(p: Project) {
  const label = `Snapshot ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  const s = takeSnapshot(p, label)
  await saveProject({ ...p, snapshots: [...p.snapshots, s] })
  toast(`Saved “${label}”. Compare it in History.`, { tone: 'ok', action: { label: 'Open', run: () => go(`/app/p/${p.id}/history`) } })
}

// ---------------- Catalog overview ----------------

const SEV_ORDER: Record<Issue['severity'], number> = { loss: 0, warn: 1, info: 2 }

function Overview({ p, update }: TabProps) {
  const a = useAnalysis(p)!
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'loss' | 'warn'>('all')
  const [allFlags, setAllFlags] = useState(false)
  const chans = CHANNELS.filter(c => p.settings.fees[c].enabled)
  const issues = useMemo(() => a.results.flatMap(r => r.issues).sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity]), [a])
  if (!p.products.length) return (
    <Empty title="No products yet">
      <p className="muted">Import a Shopify, Etsy or Faire export, or a cost sheet, to start. Or open a sample brand from the Brands page.</p>
      <Link href={`/app/p/${p.id}/import`} className="btn primary">Import your catalog</Link>
    </Empty>
  )
  const losers = a.results.filter(r => r.issues.some(i => i.code === 'faire-first-loss'))
  const avg = (c: ChannelId) => { const xs = a.results.map(r => r.channels.find(x => x.channel === c)).filter(Boolean); return xs.length ? xs.reduce((s, x) => s + x!.margin, 0) / xs.length : null }
  const shown = a.results.filter(r => filter === 'all' || r.issues.some(i => filter === 'loss' ? i.severity === 'loss' : i.severity !== 'info'))
  const current = a.results.find(r => r.product.id === open)

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span>SKUs</span><b>{p.products.length}</b><small>{p.components.length} shared components</small></div>
        <div className={`kpi${losers.length ? ' bad' : ' good'}`}><span>Lose money on a first Faire order</span><b>{losers.length}</b><small>{losers.length ? losers.map(r => r.product.sku).slice(0, 3).join(', ') : 'None, nice'}</small></div>
        {(['faireNew', 'faireReorder', 'dtc'] as ChannelId[]).filter(c => p.settings.fees[c].enabled).map(c => { const v = avg(c); return <div key={c} className="kpi"><span>Avg CM, {CHANNEL_LABEL[c]}</span><b>{v === null ? '—' : fmtPct(v)}</b><small>contribution after fees and cost</small></div> })}
      </div>

      {issues.length > 0 && (
        <details className="panel issues-panel" open={issues.some(i => i.severity === 'loss')}>
          <summary><b>{issues.filter(i => i.severity === 'loss').length} money-losing, {issues.filter(i => i.severity === 'warn').length} warnings, {issues.filter(i => i.severity === 'info').length} notes</b><span className="muted small">MAP, markup, margin and MOQ checks</span></summary>
          <ul className="flags">
            {issues.slice(0, allFlags ? 200 : 6).map((i, k) => <li key={k} className={i.severity}><button type="button" className="linkish mono" onClick={() => setOpen(p.products.find(x => x.sku === i.sku)!.id)}>{i.sku}</button> {i.message}</li>)}
          </ul>
          {issues.length > 6 && <button type="button" className="linkish small" onClick={() => setAllFlags(v => !v)}>{allFlags ? 'Show fewer' : `Show all ${issues.length}`}</button>}
        </details>
      )}

      <div className="row between wrap gap table-tools">
        <div className="seg-control" role="radiogroup" aria-label="Filter SKUs">
          {(['all', 'loss', 'warn'] as const).map(f => <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All SKUs' : f === 'loss' ? 'Losing money' : 'Needs a look'}</button>)}
        </div>
        <span className="muted small">Contribution margin per unit, after fees and fully loaded cost. Click a row for its waterfall.</span>
      </div>
      <div className="table-wrap">
        <table className="data catalog">
          <thead><tr><th>SKU</th><th>Product</th><th className="num">Unit cost</th><th className="num">Wholesale</th><th className="num">MSRP</th>{chans.map(c => <th key={c} className="num">{CHANNEL_LABEL[c]}</th>)}</tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.product.id} className="clickable" tabIndex={0} onClick={() => setOpen(r.product.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(r.product.id) }}>
                <td className="mono">{r.product.sku}</td>
                <td><span className="pname">{r.product.name}</span>{r.prices.source === 'proposed' && <span className="tag">proposed</span>}</td>
                <td className="num">{fmtUsd(r.cost.total)}</td>
                <td className="num strong">{fmtUsd(r.prices.wholesale)}</td>
                <td className="num">{fmtUsd(r.prices.msrp)}</td>
                {chans.map(c => <MarginCell key={c} r={r.channels.find(x => x.channel === c)} thin={p.settings.thinMargin} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!current} onClose={() => setOpen(null)} title={current ? `${current.product.sku} · ${current.product.name}` : ''} wide>
        {current && <ProductDetail r={current} p={p} update={update} />}
      </Modal>
    </>
  )
}

function ProductDetail({ r, p, update }: { r: ProductResult; p: Project; update: TabProps['update'] }) {
  const chans = r.channels.map(c => c.channel)
  const [ch, setCh] = useState<ChannelId>(chans.includes('faireNew') ? 'faireNew' : chans[0])
  const sel = r.channels.find(c => c.channel === ch) ?? r.channels[0]
  const set = (patch: Partial<CatalogProduct>) => update({ products: p.products.map(x => x.id === r.product.id ? { ...x, ...patch } : x) })
  const pr = r.product
  return (
    <div className="detail">
      <div className="seg-control scroll" role="radiogroup" aria-label="Channel">
        {r.channels.map(c => <button key={c.channel} type="button" role="radio" aria-checked={c.channel === ch} className={c.channel === ch ? 'on' : ''} onClick={() => setCh(c.channel)}>{CHANNEL_LABEL[c.channel]}</button>)}
      </div>
      {sel && <Waterfall cost={r.cost} prices={r.prices} ch={sel} height={380} compact />}
      {r.issues.length > 0 && <ul className="flags">{r.issues.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}</ul>}
      <div className="detail-grid">
        <label className="field"><span>Wholesale</span><NumInput label="Wholesale price" prefix="$" value={pr.wholesale} onChange={v => set({ wholesale: v })} /></label>
        <label className="field"><span>MSRP</span><NumInput label="MSRP" prefix="$" value={pr.msrp} onChange={v => set({ msrp: v })} /></label>
        <label className="field"><span>Your site price</span><NumInput label="Your site price" prefix="$" value={pr.dtcPrice} onChange={v => set({ dtcPrice: v })} /></label>
        <label className="field"><span>Etsy price</span><NumInput label="Etsy price" prefix="$" value={pr.etsyPrice} onChange={v => set({ etsyPrice: v })} /></label>
        <label className="field"><span>MOQ</span><NumInput label="Minimum order quantity" step={1} min={1} value={pr.moq} onChange={v => set({ moq: Math.round(v ?? 1) })} /></label>
        <label className="field"><span>Case size</span><NumInput label="Case size" step={1} min={1} value={pr.caseSize} onChange={v => set({ caseSize: Math.round(v ?? 1) })} /></label>
        <label className="field"><span>Competitor MSRP</span><NumInput label="Competitor MSRP" prefix="$" value={pr.competitorMsrp} onChange={v => set({ competitorMsrp: v })} /></label>
        <label className="field"><span>Order mix weight</span><NumInput label="Order mix weight" step={1} value={pr.mixWeight ?? 1} onChange={v => set({ mixWeight: v ?? 1 })} /></label>
      </div>
      <p className="muted small">Unit cost {fmtUsd(r.cost.total)}: materials {fmtUsd(r.cost.materials)}, packaging {fmtUsd(r.cost.packaging)}, labour {fmtUsd(r.cost.labour)} ({pr.labourMinutes} min), overhead {fmtUsd(r.cost.overhead)}. Edit the recipe in <Link href={`/app/p/${p.id}/costs`}>Costs & BOM</Link>. Strategy proposal: {fmtUsd(r.proposal.wholesale)} / {fmtUsd(r.proposal.msrp)}{r.proposal.note ? ` (${r.proposal.note})` : ''}.</p>
    </div>
  )
}
