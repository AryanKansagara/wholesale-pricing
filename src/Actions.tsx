import { fairePriceCsv, rationaleText, shopifyPriceCsv } from './engine/catalog.ts'
import { useAnalysis } from './projectData.ts'
import type { TabProps } from './Project.tsx'
import { Code, download, Empty, Link } from './ui.tsx'

const fileBase = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function Actions({ p, update, setS }: TabProps) {
  const a = useAnalysis(p)!
  if (!p.products.length) return <Empty title="Nothing to export yet"><Link href={`/app/p/${p.id}/import`} className="btn primary">Import your catalog</Link></Empty>
  const shop = shopifyPriceCsv(a.results), faire = fairePriceCsv(a.results)
  const rationale = rationaleText(p.name, a.results, p.settings, a.econ)
  const b = p.brand
  const setB = (patch: Partial<typeof b>) => update({ brand: { ...b, ...patch } })
  const date = new Date().toISOString().slice(0, 10)
  const proposedCount = a.results.filter(r => r.prices.source === 'proposed').length
  return (
    <div className="stack">
      <div className="action-cards">
        <article className="action-card hero-card">
          <div className="eyebrow">Print or save as PDF</div>
          <h2>Line sheet</h2>
          <p>Cover, product grid with wholesale and MSRP, case packs and MOQs, your terms and an order form retailers can fill in by hand.</p>
          <Link href={`/app/p/${p.id}/linesheet`} className="btn primary">Open the line sheet</Link>
        </article>
        <article className="action-card">
          <div className="eyebrow">One page</div>
          <h2>Pricing rationale</h2>
          <p>How every price was set, the fees it assumes and what a new retailer is worth. For a partner, a rep or future you.</p>
          <Link href={`/app/p/${p.id}/rationale`} className="btn ghost">Open the rationale</Link>
        </article>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Line sheet details</h2><span className="muted small">Printed on the cover and order form</span></div>
        <div className="detail-grid">
          <label className="field"><span>Tagline</span><input value={b.tagline} onChange={e => setB({ tagline: e.target.value })} placeholder="Hand-poured in small batches" /></label>
          <label className="field"><span>Wholesale email</span><input type="email" value={b.email} onChange={e => setB({ email: e.target.value })} placeholder="wholesale@yourbrand.com" /></label>
          <label className="field"><span>Website</span><input value={b.website} onChange={e => setB({ website: e.target.value })} placeholder="yourbrand.com" /></label>
          <label className="field"><span>Lead time</span><input value={b.leadTime} onChange={e => setB({ leadTime: e.target.value })} /></label>
        </div>
        <label className="field"><span>Terms</span><textarea rows={2} value={p.settings.terms} onChange={e => setS({ terms: e.target.value })} /></label>
      </div>

      {proposedCount > 0 && <p className="report warn">{proposedCount} SKU{proposedCount > 1 ? 's have' : ' has'} no current price, so the exports use the strategy's proposal. Review them in <Link href={`/app/p/${p.id}/pricing`}>Pricing</Link>.</p>}

      <div className="panel">
        <div className="panel-head">
          <h2>Shopify price update</h2>
          <button type="button" className="btn primary sm" onClick={() => download(`${fileBase(p.name)}-shopify-prices-${date}.csv`, shop)}>Download CSV</button>
        </div>
        <p className="muted small">Sets each variant's price to MSRP so your own site never undercuts stockists, and records unit cost in <code>Cost per item</code>. In Shopify: Products → Import → tick “Overwrite products with matching handles”. Columns checked {p.settings.feesCheckedOn}; see <Link href="/docs#exports">the docs</Link>.</p>
        <Code code={shop.split('\n').slice(0, 8).join('\n')} label="CSV preview (first rows)" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Faire price update</h2>
          <button type="button" className="btn primary sm" onClick={() => download(`${fileBase(p.name)}-faire-prices-${date}.csv`, faire)}>Download CSV</button>
        </div>
        <p className="muted small">Wholesale, retail, minimum order quantity and case size by SKU, in the column names of Faire's bulk product sheet. Paste into the template from your brand portal (Products → Bulk edit), matching on SKU.</p>
        <Code code={faire.split('\n').slice(0, 8).join('\n')} label="CSV preview (first rows)" />
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Rationale as text</h2><button type="button" className="btn ghost sm" onClick={() => download(`${fileBase(p.name)}-pricing-rationale-${date}.txt`, rationale, 'text/plain')}>Download .txt</button></div>
        <Code code={rationale} label="Plain text" />
      </div>
    </div>
  )
}
