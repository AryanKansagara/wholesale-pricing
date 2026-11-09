import { useEffect, useState } from 'react'
import { SAMPLES } from './engine/sample.ts'
import { createBlankProject, createSampleProject, useAnalysis } from './projectData.ts'
import { deleteProject, saveProject, useProjects, type Project } from './store.ts'
import { useSync } from './sync.ts'
import { ask, fmtDate, fmtPct, go, Link, SyntheticBadge, toast } from './ui.tsx'

export default function Workspace() {
  const list = useProjects()
  const sync = useSync()
  const [busy, setBusy] = useState<string | null>(null)

  // /app?sample=acme opens (or creates) the sample straight away.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const s = q.get('sample')
    const tab = q.get('tab')?.replace(/[^a-z]/g, '')
    if (!s || list === null || busy) return
    if (!SAMPLES.some(x => x.id === s)) return
    setBusy(s)
    void createSampleProject(s).then(p => go(`/app/p/${p.id}${tab ? '/' + tab : ''}`, { replace: true }))
  }, [list, busy])

  const openSample = async (id: string) => { setBusy(id); const p = await createSampleProject(id); go(`/app/p/${p.id}`) }
  const newProject = async () => {
    const name = `My brand ${(list?.filter(p => !p.sampleId).length ?? 0) + 1}`
    const p = await createBlankProject(name)
    go(`/app/p/${p.id}/import`)
  }

  if (list === null || busy) return <div className="boot" role="status"><span className="spinner" /> {busy ? 'Setting up the sample brand' : 'Opening your brands'}</div>

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Your brands</h1>
          <p className="muted">One workspace per brand: catalog, costs, fees, prices and dated snapshots. {sync.user ? 'Synced to your account.' : 'Stored on this device.'}</p>
        </div>
        {list.length > 0 && <div className="row gap"><button type="button" className="btn primary" onClick={newProject}>New brand</button></div>}
      </div>

      {list.length === 0 ? (
        <div className="onboard">
          <article className="onboard-card feature">
            <div className="eyebrow">Two minutes</div>
            <h2>Try the sample</h2>
            <p>Invented brands with real-looking problems, fully costed. Find the SKU that loses money on a first Faire order, fix it, print the line sheet.</p>
            <div className="stack-sm">
              {SAMPLES.map(s => (
                <button key={s.id} type="button" className="sample-btn" onClick={() => void openSample(s.id)}>
                  <span><strong>{s.name}</strong><small>{s.blurb}</small></span><span aria-hidden="true">&rarr;</span>
                </button>
              ))}
            </div>
          </article>
          <article className="onboard-card">
            <div className="eyebrow">Your brand</div>
            <h2>Import your data</h2>
            <p>Export your products from Shopify, Etsy or Faire, add a cost sheet (materials, labour minutes, packaging), and drop them in. Formats are detected and columns mapped for you.</p>
            <div className="row gap wrap">
              <button type="button" className="btn primary" onClick={newProject}>Import your data</button>
              <Link href="/docs" className="btn ghost">Export steps</Link>
            </div>
            <p className="muted small">Files are parsed in your browser and stay on this device.</p>
          </article>
        </div>
      ) : (
        <>
          <div className="project-grid">
            {list.map(p => <ProjectCard key={p.id} p={p} />)}
          </div>
          <div className="samples-row">
            <span className="muted small">Samples:</span>
            {SAMPLES.map(s => <button key={s.id} type="button" className="linkish small" onClick={() => void openSample(s.id)}>{s.name}</button>)}
          </div>
        </>
      )}
    </section>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const [renaming, setRenaming] = useState(false)
  const res = useAnalysis(p)
  const losses = res?.results.filter(r => r.issues.some(i => i.code === 'faire-first-loss')).length ?? 0
  const avg = res && res.results.length ? res.results.reduce((a, r) => a + (r.channels.find(c => c.channel === 'faireReorder')?.margin ?? 0), 0) / res.results.length : null
  return (
    <article className="project-card">
      <div className="row between">
        {renaming ? (
          <form onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n')).trim(); if (v) void saveProject({ ...p, name: v }); setRenaming(false) }}>
            <input name="n" defaultValue={p.name} autoFocus aria-label="Brand name" onBlur={e => e.currentTarget.form?.requestSubmit()} />
          </form>
        ) : <h3><Link href={`/app/p/${p.id}`}>{p.name}</Link></h3>}
        {p.sampleId && <SyntheticBadge />}
      </div>
      <dl className="mini-stats">
        <div><dt>SKUs</dt><dd>{p.products.length}</dd></div>
        <div><dt>Faire reorder CM</dt><dd>{avg === null ? '—' : fmtPct(avg)}</dd></div>
        <div><dt>First-order losers</dt><dd className={losses ? 'bad' : ''}>{losses}</dd></div>
        <div><dt>Snapshots</dt><dd>{p.snapshots.length}</dd></div>
      </dl>
      <div className="row between">
        <span className="muted small">Updated {fmtDate(p.updatedAt)}</span>
        <div className="row gap-sm">
          <button type="button" className="btn ghost sm" onClick={() => setRenaming(true)}>Rename</button>
          <button type="button" className="btn danger-ghost sm" onClick={async () => {
            if (!(await ask(`Delete “${p.name}”?`, 'Removes the brand, its catalog and its snapshots from this device (and the cloud, if you are signed in). You can undo for a few seconds.', 'Delete brand'))) return
            const undo = await deleteProject(p.id)
            toast(`Deleted ${p.name}`, { undo: () => void undo() })
          }}>Delete</button>
        </div>
      </div>
    </article>
  )
}
