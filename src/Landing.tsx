import { useMemo, useState } from 'react'
import { Waterfall } from './charts.tsx'
import { FEES_CHECKED } from './engine/fees.ts'
import { analyse, CHANNEL_LABEL, channelResult, channelPrice, type ChannelId } from './engine/model.ts'
import { SAMPLES } from './engine/sample.ts'
import { fmtPct, fmtUsd, Link } from './ui.tsx'

const brand = SAMPLES[0].build()
const HERO_SKUS = ['EW-04-FIG', 'EW-08-FIG', 'EW-DIF-100']
const HERO_CH: ChannelId[] = ['faireNew', 'faireReorder', 'faireDirect', 'dtc', 'etsy']

function Hero() {
  const [sku, setSku] = useState(HERO_SKUS[0])
  const [ch, setCh] = useState<ChannelId>('faireNew')
  const [adj, setAdj] = useState(0)
  const base = useMemo(() => analyse(brand.products, brand.components, brand.settings), [])
  const r = base.find(x => x.product.sku === sku)!
  const cost = { ...r.cost, materials: Math.max(0, r.cost.materials + adj), total: Math.max(0, r.cost.total - r.cost.materials + Math.max(0, r.cost.materials + adj)) }
  const res = channelResult(ch, channelPrice(ch, r.product, r.prices), cost.total, brand.settings.fees[ch])
  const lo = -r.cost.materials, hi = r.prices.wholesale
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v))
  return (
    <div className="hero-demo" aria-label="Live price waterfall">
      <div className="hero-demo-head">
        <div className="seg-control" role="radiogroup" aria-label="Product">
          {HERO_SKUS.map(s => { const p = brand.products.find(x => x.sku === s)!; return <button key={s} type="button" role="radio" aria-checked={sku === s} className={sku === s ? 'on' : ''} onClick={() => { setSku(s); setAdj(0) }}>{p.name.replace('Black Fig ', '').replace(' candle', '')}</button> })}
        </div>
        <span className="badge synthetic" title="Invented brand">Synthetic brand</span>
      </div>
      <Waterfall cost={cost} prices={r.prices} ch={res} onDragCost={dy => setAdj(a => clamp(a + dy))} />
      <div className="seg-control scroll" role="radiogroup" aria-label="Channel">
        {HERO_CH.map(c => <button key={c} type="button" role="radio" aria-checked={ch === c} className={ch === c ? 'on' : ''} onClick={() => setCh(c)}>{CHANNEL_LABEL[c]}</button>)}
      </div>
      <div className="hero-readout">
        <label className="cost-slider">
          <span>Materials {adj >= 0 ? '+' : '−'}{fmtUsd(Math.abs(adj))} <small className="muted">(drag the cost bars, or this)</small></span>
          <input type="range" min={lo} max={hi} step={0.05} value={adj} onChange={e => setAdj(Number(e.target.value))} aria-label="Change material cost" />
        </label>
        <div className={`keep ${res.contribution < 0 ? 'neg' : ''}`} aria-live="polite">
          <span>You keep per unit</span>
          <b>{fmtUsd(res.contribution)}</b>
          <small>{fmtPct(res.margin)} of {fmtUsd(res.price)}{res.contribution < 0 && ch === 'faireNew' ? ' · loses money on a first order' : ''}</small>
        </div>
      </div>
    </div>
  )
}

export function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">Pricing and line sheets for makers going wholesale</div>
            <h1>Price for wholesale without losing money on the first order.</h1>
            <p className="lede">Wholesale Ready rolls up what each product really costs, sets wholesale and MSRP, and shows what you keep on Faire, Etsy, your own site and direct, fee by fee. Then it prints the line sheet.</p>
            <div className="hero-actions">
              <Link href="/app?sample=ember-wick" className="btn primary lg">Try the sample brand</Link>
              <Link href="/app" className="btn ghost lg">Import your catalog</Link>
            </div>
            <p className="muted small">Free, no account needed. Your files are parsed in your browser.</p>
          </div>
          <Hero />
        </div>
      </section>

      <section className="section band">
        <div className="section-inner">
          <div className="eyebrow">Sound familiar?</div>
          <h2 className="serif">Handmade margins leave no room for a middleman.</h2>
          <div className="quotes">
            <figure><blockquote>A small-business owner in a crisis trying to price for Faire. The advice that stuck: build a simpler wholesale version that costs less to make, and use minimums.</blockquote><figcaption>Paraphrased from r/smallbusiness</figcaption></figure>
            <figure><blockquote>A seller ran the numbers after a round of fee changes and found another 10 to 20 percent gone from margin, which meant raising prices.</blockquote><figcaption>Paraphrased from a thread on Faire fees</figcaption></figure>
            <figure><blockquote>Brands go back and forth on a $100 opening minimum versus per-product minimums: lower barriers bring more retailers, but small first orders can lose money.</blockquote><figcaption>Paraphrased from r/FaireCommunity</figcaption></figure>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <div className="eyebrow">How it works</div>
          <h2 className="serif">From a product export to prices you can defend</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><h3>Import</h3><p>Your Shopify, Etsy or Faire product export, plus a cost sheet: materials, labour minutes, packaging and overhead. Shared components (jars, wax, boxes) live in one bill of materials.</p></li>
            <li><span className="step-n">2</span><h3>Price</h3><p>Keystone, a target margin or a competitor-anchored MSRP, rounded to real price points. Every SKU gets a contribution margin on six channels.</p></li>
            <li><span className="step-n">3</span><h3>Fix</h3><p>Flags for SKUs that lose money on a first Faire order, sites that undercut your own MSRP, and thin margins. Simulate a cheaper wholesale tier and see what it saves.</p></li>
            <li><span className="step-n">4</span><h3>Ship</h3><p>A printable line sheet with an order form, price-update CSVs for Shopify and Faire, and a one-page pricing rationale.</p></li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="section-inner features">
          {[
            ['First-order losses, found', 'A $10 new-retailer fee is noise on a $16 candle and a disaster on a $7 tin. Fees are allocated by each SKU’s share of the order, so you see exactly which products sink.'],
            ['Minimums that pay back', 'Set your opening minimum, typical reorder and reorder rate. See the break-even first order and how many reorders it takes before a new retailer turns a profit.'],
            ['MAP and MSRP checks', 'If your site or Etsy shop sells below the MSRP you give retailers, they will notice. So will the check.'],
            ['Wholesale tier simulator', 'Swap the rigid gift box for a kraft sleeve, batch-pour to save labour, and watch the losers turn green before you change a thing.'],
            ['Snapshots and compare', 'Save a snapshot before a supplier raises prices or a marketplace changes fees, then see exactly what happened to every margin.'],
            ['Your data, your device', 'Everything works signed out and stays in your browser. Sign in only if you want your brands on another device.'],
          ].map(([t, d]) => <article key={t} className="feature"><h3>{t}</h3><p>{d}</p></article>)}
        </div>
      </section>

      <section className="section">
        <div className="section-inner cta-band">
          <div>
            <h2 className="serif">Fees, dated and sourced</h2>
            <p>Faire, Etsy and Shopify fees as of {FEES_CHECKED}, with where each number comes from. Every rate is editable per brand, because they change.</p>
          </div>
          <div className="row gap wrap"><Link href="/docs#fees" className="btn ghost">See the fee table</Link><Link href="/app" className="btn primary">Open the app</Link></div>
        </div>
      </section>
    </>
  )
}
