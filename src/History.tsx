import { useMemo, useState } from 'react'
import { analyse, CHANNEL_LABEL, compareSnapshots, snapshotRows, type ChannelFees, type ChannelId } from './engine/model.ts'
import { takeSnapshot } from './projectData.ts'
import type { TabProps } from './Project.tsx'
import { deleteSnapshotCloud } from './sync.ts'
import { Empty, fmtDate, fmtUsd, signed, toast } from './ui.tsx'

const NOW = '__now__'
const FEE_LABEL: Partial<Record<keyof ChannelFees, string>> = { commission: 'commission', processing: 'processing', perOrder: 'per-order fee', perUnit: 'per-unit fee', adsRate: 'ads fee', adsShare: 'ads share', fulfilment: 'fulfilment', aov: 'typical order', enabled: 'enabled' }
const fmtFee = (k: keyof ChannelFees, v: number | boolean) => typeof v === 'boolean' ? (v ? 'on' : 'off') : ['commission', 'processing', 'adsRate', 'adsShare'].includes(k) ? `${(v * 100).toFixed(1)}%` : fmtUsd(v)

export default function History({ p, update }: TabProps) {
  const snaps = [...p.snapshots].sort((a, b) => a.at - b.at)
  const [from, setFrom] = useState(snaps.at(-1)?.id ?? '')
  const [to, setTo] = useState(NOW)
  const [ch, setCh] = useState<ChannelId>('faireNew')
  const now = useMemo(() => ({ rows: snapshotRows(analyse(p.products, p.components, p.settings)), fees: p.settings.fees, labourRate: p.settings.labourRate }), [p])
  const pick = (id: string) => id === NOW ? now : snaps.find(s => s.id === id)
  const A = pick(from), B = pick(to)
  const diff = A && B ? compareSnapshots(A, B) : null

  const save = (label: string) => {
    if (!label) return
    const s = takeSnapshot(p, label)
    update({ snapshots: [...p.snapshots, s] })
    setFrom(s.id)
    toast(`Saved “${label}”`, { tone: 'ok' })
  }
  const del = (id: string) => {
    const before = p.snapshots
    update({ snapshots: p.snapshots.filter(s => s.id !== id) })
    void deleteSnapshotCloud(id)
    toast('Snapshot deleted', { undo: () => update({ snapshots: before }) })
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Snapshots</h2><form className="row gap-sm" onSubmit={e => { e.preventDefault(); const f = e.currentTarget; save(String(new FormData(f).get('label')).trim()); f.reset() }}>
          <input name="label" aria-label="Snapshot name" placeholder="e.g. Before wax price rise" required />
          <button className="btn primary sm">Save snapshot</button>
        </form></div>
        <p className="muted small">Save one whenever costs or fees change (a supplier price rise, a marketplace fee update). Each keeps every SKU's cost, prices and per-channel margins, plus the fee table at the time.</p>
        {snaps.length === 0 ? <Empty title="No snapshots yet"><p className="muted">Save one now, change a cost or a fee, then compare.</p></Empty> : (
          <ul className="snap-list">
            {snaps.map(s => (
              <li key={s.id}>
                <div><b>{s.label}</b><span className="muted small">{fmtDate(s.at)} · {s.rows.length} SKUs · labour {fmtUsd(s.labourRate)}/hr</span></div>
                <button type="button" className="icon-btn xs danger" aria-label={`Delete ${s.label}`} onClick={() => del(s.id)}>&times;</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {snaps.length > 0 && diff && (
        <div className="panel">
          <div className="panel-head"><h2>Compare</h2></div>
          <div className="controls flat">
            <label className="ctl">From<select value={from} onChange={e => setFrom(e.target.value)}>{snaps.map(s => <option key={s.id} value={s.id}>{s.label} ({fmtDate(s.at)})</option>)}</select></label>
            <label className="ctl">To<select value={to} onChange={e => setTo(e.target.value)}><option value={NOW}>Now (live)</option>{snaps.map(s => <option key={s.id} value={s.id}>{s.label} ({fmtDate(s.at)})</option>)}</select></label>
            <label className="ctl">Margin on<select value={ch} onChange={e => setCh(e.target.value as ChannelId)}>{(Object.keys(CHANNEL_LABEL) as ChannelId[]).map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></label>
          </div>
          {(diff.fees.length > 0 || diff.labour) && (
            <div className="report warn">
              <b>What changed in your assumptions</b>
              <ul className="issues">
                {diff.labour && <li>Labour rate {fmtUsd(diff.labour[0])}/hr → {fmtUsd(diff.labour[1])}/hr</li>}
                {diff.fees.map((f, i) => <li key={i}>{CHANNEL_LABEL[f.channel]} {FEE_LABEL[f.field] ?? f.field}: {fmtFee(f.field, f.from)} → {fmtFee(f.field, f.to)}</li>)}
              </ul>
            </div>
          )}
          {diff.rows.every(r => r.status === 'same') && !diff.fees.length ? <p className="muted">No differences between these two.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>SKU</th><th>Status</th><th className="num">Unit cost</th><th className="num">Wholesale</th><th className="num">{CHANNEL_LABEL[ch]} margin</th></tr></thead>
                <tbody>
                  {diff.rows.filter(r => r.status !== 'same').map(r => {
                    const cm = r.cm[ch]
                    const d = cm && cm[0] !== null && cm[1] !== null ? cm[1] - cm[0] : null
                    return (
                      <tr key={r.sku}>
                        <td><span className="mono">{r.sku}</span> <span className="muted small">{r.name}</span></td>
                        <td><span className={`tag ${r.status}`}>{r.status}</span></td>
                        <td className="num">{pair(r.cost)}</td>
                        <td className="num">{pair(r.wholesale)}</td>
                        <td className="num">{cm ? <>{cm[0] === null ? '—' : `${(cm[0] * 100).toFixed(0)}%`} → {cm[1] === null ? '—' : `${(cm[1] * 100).toFixed(0)}%`} {d !== null && Math.abs(d) >= 0.005 && <small className={d > 0 ? 'up' : 'down'}>{signed(d * 100, x => `${x.toFixed(0)} pts`)}</small>}</> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function pair([a, b]: [number | null, number | null]) {
  if (a === null || b === null) return a === null ? fmtUsd(b ?? 0) : fmtUsd(a)
  if (a === b) return fmtUsd(a)
  return <>{fmtUsd(a)} → <b>{fmtUsd(b)}</b></>
}
