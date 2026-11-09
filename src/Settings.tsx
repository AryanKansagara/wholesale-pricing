import { useState } from 'react'
import type { Rounding } from './engine/model.ts'
import { deleteProject, getDefaults, getProjects, setDefaults, type Defaults } from './store.ts'
import { exportAll, SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, setTheme, toast, useDark } from './ui.tsx'

export default function Settings() {
  const [d, setD] = useState<Defaults>(getDefaults)
  const dark = useDark()
  const sync = useSync()
  const save = (p: Partial<Defaults>) => { const next = { ...d, ...p }; setD(next); setDefaults(next); toast('Saved', { tone: 'ok', ttl: 1500 }) }

  return (
    <section className="page narrow settings">
      <div className="eyebrow">Settings</div>
      <h1>Settings</h1>

      <div className="panel">
        <h2>Defaults for new projects</h2>
        <p className="muted small">Existing brands keep their own settings; change those inside the brand.</p>
        <label className="field"><span>Labour rate ($/hr)</span><input type="number" min="0" step="0.5" value={d.labourRate} onChange={e => save({ labourRate: Math.max(0, Number(e.target.value)) })} /></label>
        <label className="field"><span>Opening order minimum ($)</span><input type="number" min="0" step="25" value={d.orderMinimum} onChange={e => save({ orderMinimum: Math.max(0, Number(e.target.value)) })} /></label>
        <label className="field"><span>Retail markup (×)</span><input type="number" min="1" step="0.1" value={d.retailMarkup} onChange={e => save({ retailMarkup: Math.max(1, Number(e.target.value)) })} /></label>
        <label className="field"><span>Round MSRP to</span>
          <select value={d.rounding} onChange={e => save({ rounding: e.target.value as Rounding })}><option value="whole">Whole dollars</option><option value="half">50 cents</option><option value="charm">Charm (.99)</option><option value="none">Exact cents</option></select>
        </label>
      </div>

      <div className="panel">
        <h2>Appearance</h2>
        <div className="seg-control" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
          <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>

      <div className="panel">
        <h2>Your data</h2>
        <p>Projects live in this browser (IndexedDB). {sync.user ? <>Signed in as <b>{sync.user.email}</b>: catalogs, costs, fees and snapshots under {(SYNC_LIMIT / 1e6).toFixed(0)} MB per brand sync to your account. Uploaded files are never stored.</> : 'Sign in from the account menu (top right) to sync across devices. It is optional.'}</p>
        <div className="row gap wrap">
          <button type="button" className="btn ghost" onClick={async () => download(`wholesale-ready-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export all my data (JSON)</button>
          <button type="button" className="btn danger-ghost" onClick={async () => {
            const list = getProjects()
            if (!list.length) { toast('Nothing to delete'); return }
            if (!(await ask('Delete all brands?', `Removes ${list.length} brand${list.length > 1 ? 's' : ''} from this browser${sync.user ? ' and from your cloud account' : ''}. You can undo for a few seconds.`, 'Delete everything'))) return
            const undos = await Promise.all(list.map(p => deleteProject(p.id)))
            toast(`Deleted ${list.length} brands`, { undo: () => { for (const u of undos) void u() } })
          }}>Delete all brands</button>
        </div>
      </div>

      <div className="panel">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          <div><dt><kbd>1</kbd>&ndash;<kbd>9</kbd></dt><dd>Switch sections inside a brand</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Save a snapshot</dd></div>
          <div><dt><kbd>L</kbd></dt><dd>Open the line sheet</dd></div>
          <div><dt><kbd>&#8593;</kbd> <kbd>&#8595;</kbd></dt><dd>Nudge a number (Shift for ×10)</dd></div>
          <div><dt><kbd>&#8984;</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last delete or bulk change</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>Show shortcuts in a brand</dd></div>
        </dl>
      </div>
    </section>
  )
}
