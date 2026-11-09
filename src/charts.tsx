import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CHANNEL_LABEL, type ChannelResult, type CostBreakdown, type Prices } from './engine/model.ts'
import { fmtUsd } from './ui.tsx'

// ---------- Number input that lets you type freely and commits valid numbers ----------

export function NumInput({ value, onChange, step = 0.01, min = 0, max, pct, prefix, suffix, label, id, width }: {
  value: number | undefined; onChange(v: number | undefined): void; step?: number; min?: number; max?: number; pct?: boolean; prefix?: string; suffix?: string; label: string; id?: string; width?: number
}) {
  const shown = value === undefined ? '' : String(pct ? Math.round(value * 10000) / 100 : Math.round(value * 10000) / 10000)
  const [text, setText] = useState(shown)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(shown) }, [shown])
  const commit = (t: string) => {
    if (t.trim() === '') { onChange(undefined); return }
    let n = Number(t)
    if (!Number.isFinite(n)) return
    if (pct) n /= 100
    if (n < min) n = min
    if (max !== undefined && n > max) n = max
    onChange(n)
  }
  return (
    <span className="num-input" style={width ? { width } : undefined}>
      {prefix && <span className="affix">{prefix}</span>}
      <input id={id} aria-label={label} inputMode="decimal" value={text} step={step}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; setText(shown) }}
        onChange={e => { setText(e.target.value); commit(e.target.value) }}
        onKeyDown={e => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          const cur = value ?? 0
          const d = (e.key === 'ArrowUp' ? 1 : -1) * (pct ? step / 100 : step) * (e.shiftKey ? 10 : 1)
          const n = Math.max(min, Math.round((cur + d) * 10000) / 10000)
          onChange(max !== undefined ? Math.min(max, n) : n)
        }} />
      {(suffix ?? (pct ? '%' : '')) && <span className="affix">{suffix ?? '%'}</span>}
    </span>
  )
}

// ---------- Margin cell colouring ----------

export function marginTone(m: number, thin = 0.15) { return m < 0 ? 'neg' : m < thin ? 'thin' : m < 0.35 ? 'ok' : 'good' }

export function MarginCell({ r, thin }: { r: ChannelResult | undefined; thin: number }) {
  if (!r) return <td className="num muted">—</td>
  return (
    <td className={`num cm ${marginTone(r.margin, thin)}`} title={`${CHANNEL_LABEL[r.channel]}: ${fmtUsd(r.contribution)} a unit on a ${fmtUsd(r.price)} sale`}>
      <span>{(r.margin * 100).toFixed(0)}%</span><small>{fmtUsd(r.contribution)}</small>
    </td>
  )
}

// ---------- Price waterfall: cost -> wholesale -> MSRP, then one channel's fees peeling off ----------

interface Step { label: string; value: number; kind: 'cost' | 'up' | 'total' | 'fee' | 'keep' | 'loss'; note?: string }

export function priceSteps(cost: CostBreakdown, prices: Prices, ch: ChannelResult): { build: Step[]; keep: Step[] } {
  const build: Step[] = [
    { label: 'Materials', value: cost.materials, kind: 'cost' },
    { label: 'Packaging', value: cost.packaging, kind: 'cost' },
    { label: 'Labour', value: cost.labour, kind: 'cost' },
    { label: 'Overhead', value: cost.overhead, kind: 'cost' },
    { label: 'Margin', value: prices.wholesale - cost.total, kind: prices.wholesale - cost.total < 0 ? 'fee' : 'up' },
    { label: 'Wholesale', value: prices.wholesale, kind: 'total' },
    { label: 'Retailer', value: prices.msrp - prices.wholesale, kind: 'up' },
    { label: 'MSRP', value: prices.msrp, kind: 'total' },
  ]
  const keep: Step[] = [
    { label: 'Price', value: ch.price, kind: 'total' },
    { label: 'Commission', value: ch.commission, kind: 'fee' },
    { label: 'Processing', value: ch.processing, kind: 'fee' },
    { label: 'Other fees', value: ch.orderFees + ch.unitFees + ch.ads, kind: 'fee' },
    { label: 'Fulfilment', value: ch.fulfilment, kind: 'fee' },
    { label: 'Cost', value: ch.cost, kind: 'fee' },
    { label: 'Keep', value: ch.contribution, kind: ch.contribution < 0 ? 'loss' : 'keep' },
  ].filter(s => s.kind !== 'fee' || s.value > 0.004) as Step[]
  return { build, keep }
}

/** Waterfall in one SVG. `onDragCost` makes the cost columns draggable (vertical drag scales the cost). */
export function Waterfall({ cost, prices, ch, onDragCost, height = 440, compact }: {
  cost: CostBreakdown; prices: Prices; ch: ChannelResult; onDragCost?: (dy: number) => void; height?: number; compact?: boolean
}) {
  const { build, keep } = priceSteps(cost, prices, ch)
  const all = [...build, ...keep]
  const top = Math.max(prices.msrp, ch.price, cost.total) * 1.08
  const bottom = Math.min(0, ch.contribution) * 1.15
  const colW = 80, barW = compact ? 50 : 48
  const W = colW * all.length + 60, H = height, padT = 40, padB = 40
  const y = (v: number) => padT + (top - v) / (top - bottom) * (H - padT - padB)
  const drag = useRef<{ y: number } | null>(null)

  let run = 0
  const bars: ReactNode[] = []
  all.forEach((s, i) => {
    const x = 20 + i * colW + (i >= build.length ? 20 : 0)
    let y0: number, y1: number
    if (i === build.length) run = s.value
    if (s.kind === 'total') { y0 = 0; y1 = s.value; run = s.value }
    else if (s.kind === 'cost' || s.kind === 'up') { y0 = run; y1 = run + s.value; run = y1 }
    else if (s.kind === 'fee') { y0 = run - s.value; y1 = run; run = y0 }
    else { y0 = Math.min(0, s.value); y1 = Math.max(0, s.value) }
    const top_ = y(Math.max(y0, y1)), h = Math.max(1.5, Math.abs(y(y0) - y(y1)))
    const isCost = s.kind === 'cost'
    bars.push(
      <g key={i} className={`wf-col ${s.kind}${isCost && onDragCost ? ' draggable' : ''}`} style={{ ['--i' as string]: i }}>
        <rect className="wf-bar" x={x + (colW - barW) / 2} y={top_} width={barW} height={h} rx={3}
          onPointerDown={isCost && onDragCost ? e => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { y: e.clientY } } : undefined}
          onPointerMove={isCost && onDragCost ? e => { if (!drag.current) return; const rect = (e.currentTarget.ownerSVGElement!).getBoundingClientRect(); const scale = (top - bottom) / (rect.height * (H - padT - padB) / H); onDragCost((drag.current.y - e.clientY) * scale); drag.current = { y: e.clientY } } : undefined}
          onPointerUp={() => { drag.current = null }} />
        <text className="wf-val" x={x + colW / 2} y={top_ - 7} textAnchor="middle">{s.kind === 'fee' || s.kind === 'loss' ? '−' : ''}{fmtUsd(Math.abs(s.value))}</text>
        <text className="wf-label" x={x + colW / 2} y={H - padB + 18} textAnchor="middle">{s.label}</text>
        {i < all.length - 1 && s.kind !== 'keep' && s.kind !== 'loss' && i !== build.length - 1 && (
          <line className="wf-link" x1={x + (colW + barW) / 2} x2={x + colW + (colW - barW) / 2 + (i + 1 === build.length ? 20 : 0)} y1={y(run)} y2={y(run)} />
        )}
      </g>,
    )
  })
  const split = 20 + build.length * colW + 10
  return (
    <svg className="waterfall" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price waterfall: unit cost ${fmtUsd(cost.total)}, wholesale ${fmtUsd(prices.wholesale)}, MSRP ${fmtUsd(prices.msrp)}; on ${CHANNEL_LABEL[ch.channel]} you keep ${fmtUsd(ch.contribution)} a unit.`}>
      <line className="wf-zero" x1={10} x2={W - 10} y1={y(0)} y2={y(0)} />
      <line className="wf-split" x1={split} x2={split} y1={8} y2={H - 8} />
      <text className="wf-head" x={20} y={16}>Build the price</text>
      <text className="wf-head" x={split + 12} y={16}>{CHANNEL_LABEL[ch.channel]}: what you keep</text>
      {bars}
    </svg>
  )
}

// ---------- Retailer lifetime value curve ----------

export function LtvChart({ curve, firstLabel = 'First order' }: { curve: number[]; firstLabel?: string }) {
  const W = 640, H = 220, pad = { l: 56, r: 16, t: 16, b: 34 }
  const max = Math.max(0, ...curve), min = Math.min(0, ...curve)
  const span = max - min || 1
  const x = (i: number) => pad.l + (curve.length <= 1 ? 0 : i / (curve.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (max - v) / span * (H - pad.t - pad.b)
  const pts = curve.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const ticks = [min, 0, max].filter((v, i, a) => a.indexOf(v) === i)
  const cross = curve.findIndex(v => v >= -1e-9)
  return (
    <svg className="ltv" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Expected cumulative profit per retailer: starts at ${fmtUsd(curve[0])} and reaches ${fmtUsd(curve[curve.length - 1])}.`}>
      {ticks.map(t => <g key={t}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} /><text className="tick" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{fmtUsd(t, 0)}</text></g>)}
      <line className="zero" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
      <polygon className="area" points={`${x(0)},${y(0)} ${pts} ${x(curve.length - 1)},${y(0)}`} />
      <polyline className="line" points={pts} />
      {curve.map((v, i) => <circle key={i} className={`pt${v < 0 ? ' neg' : ''}${i === cross ? ' cross' : ''}`} cx={x(i)} cy={y(v)} r={i === cross ? 6 : 3.5}><title>{i === 0 ? firstLabel : `After reorder ${i}`}: {fmtUsd(v)}</title></circle>)}
      {curve.map((_, i) => (curve.length <= 13 || i % 2 === 0) && <text key={i} className="tick" x={x(i)} y={H - 12} textAnchor="middle">{i === 0 ? '1st' : `R${i}`}</text>)}
    </svg>
  )
}
