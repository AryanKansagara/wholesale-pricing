import { useMemo, useState } from 'react'
import { mergeImport } from './engine/catalog.ts'
import { detectKind, FIELD_LABEL, guessMapping, KIND_FIELDS, KIND_LABEL, parseCsv, REQUIRED, validate, type Field, type Kind, type Mapping } from './engine/csv.ts'
import type { TabProps } from './Project.tsx'
import { openXlsx, type Workbook } from './engine/xlsx.ts'
import { uuid } from './store.ts'
import { download, fmtDate, go, Link, toast } from './ui.tsx'

export const TEMPLATES = {
  'cost-sheet': 'SKU,Name,Materials,Packaging,Labour minutes,Labour rate,Overhead,MOQ,Case size,Competitor MSRP\nCANDLE-8,Black Fig 8 oz candle,2.45,1.13,6,20,,4,4,34\nTIN-4,Black Fig travel tin,1.34,1.75,5,20,,6,6,\n',
  'bom': 'SKU,Component,Qty,Unit cost,Unit,Kind\nCANDLE-8,Soy wax,7.2,0.18,oz,material\nCANDLE-8,Amber jar 8 oz,1,1.35,each,packaging\nTIN-4,Soy wax,3.6,0.18,oz,material\nTIN-4,Travel tin 4 oz,1,0.62,each,packaging\n',
  'generic': 'SKU,Name,Category,Wholesale,MSRP,Price,MOQ,Case size\nCANDLE-8,Black Fig 8 oz candle,Candles,16,32,34,4,4\n',
}

/** An .xlsx that has been opened: which worksheet is chosen (null until the user picks one) and whether hidden ones are offered. */
interface Book { wb: Workbook; sheet: number | null; showHidden: boolean; loading: boolean }
interface Pending { id: string; fileName: string; table: string[][]; kind: Kind; map: Mapping; book?: Book }

export default function Import({ p, update }: TabProps) {
  const [pending, setPending] = useState<Pending[]>([])
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState('')

  const add = async (files: FileList | File[]) => {
    const next: Pending[] = []
    for (const f of [...files]) {
      if (f.size > 20_000_000) { toast(`${f.name} is over 20 MB; split it first.`, { tone: 'error' }); continue }
      if (/\.xlsx$/i.test(f.name)) {
        try { next.push(await prepBook(f.name, await openXlsx(await f.arrayBuffer()))) } catch (e) { toast(`${f.name}: ${(e as Error).message} Save it as CSV and try again.`, { tone: 'error' }) }
        continue
      }
      if (!/\.(csv|tsv|txt)$/i.test(f.name)) { toast(`${f.name}: use a CSV or .xlsx file (old .xls and Numbers files: export as CSV).`, { tone: 'error' }); continue }
      next.push(prep(f.name, await f.text()))
    }
    setPending(x => [...x, ...next])
  }
  const prep = (fileName: string, text: string): Pending => ({ id: uuid(), fileName, ...prepTable(parseCsv(text)) })
  const prepTable = (table: string[][]) => {
    const kind = detectKind(table[0] ?? [])
    return { table, kind, map: guessMapping(table[0] ?? [], kind) }
  }
  const patch = (id: string, f: (x: Pending) => Pending) => setPending(ps => ps.map(x => x.id === id ? f(x) : x))

  // One worksheet with data is used straight away. With several, the first is used only when it is a recognised export
  // (a Faire file opens on its Products sheet as before); otherwise nothing is read until the user chooses.
  const prepBook = async (fileName: string, wb: Workbook): Promise<Pending> => {
    const withData = wb.sheets.map((s, i) => ({ s, i })).filter(x => x.s.rows > 0)
    const visible = withData.filter(x => !x.s.hidden)
    if (!withData.length) throw new Error('Every worksheet in this workbook is empty.')
    const base: Pending = { id: uuid(), fileName, table: [], kind: 'generic', map: {}, book: { wb, sheet: null, showHidden: !visible.length, loading: false } }
    if (!visible.length) return base
    const first = visible[0].i
    const table = await wb.read(first)
    if (visible.length > 1 && detectKind(table[0] ?? []) === 'generic') return base
    return { ...base, ...prepTable(table), book: { ...base.book!, sheet: first } }
  }
  // Choosing a sheet drops everything read from the previous one, then detects and maps the new one from scratch.
  const chooseSheet = async (id: string, wb: Workbook, sheet: number | null) => {
    patch(id, x => ({ ...x, table: [], kind: 'generic', map: {}, book: { ...x.book!, sheet, loading: sheet !== null } }))
    if (sheet === null) return
    try {
      const table = await wb.read(sheet)
      patch(id, x => x.book?.sheet === sheet ? { ...x, ...prepTable(table), book: { ...x.book, loading: false } } : x)
    } catch (e) {
      patch(id, x => x.book?.sheet === sheet ? { ...x, book: { ...x.book, sheet: null, loading: false } } : x)
      toast(`${wb.sheets[sheet].name}: ${(e as Error).message}`, { tone: 'error' })
    }
  }

  return (
    <div className="stack">
      <div className={`dropzone${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files) }}>
        <div className="drop-icon" aria-hidden="true" />
        <p><b>Drop CSV or Excel (.xlsx) files here</b>, or <label className="linkish">choose files<input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv" multiple hidden onChange={e => { if (e.target.files) void add(e.target.files); e.target.value = '' }} /></label></p>
        <p className="muted small">Shopify product export, Etsy listings export, Faire product export (the .xlsx as downloaded), a cost sheet, a bill of materials or any catalog CSV. Several at once is fine: import the catalog first, then costs. Files are parsed in your browser; only the resulting catalog is kept.</p>
        <p className="small">Templates: <button type="button" className="linkish" onClick={() => download('cost-sheet-template.csv', TEMPLATES['cost-sheet'])}>cost sheet</button> · <button type="button" className="linkish" onClick={() => download('bom-template.csv', TEMPLATES.bom)}>bill of materials</button> · <button type="button" className="linkish" onClick={() => download('catalog-template.csv', TEMPLATES.generic)}>catalog</button> · <Link href="/docs#exports">How to export from Shopify, Etsy and Faire</Link></p>
      </div>
      <details className="panel">
        <summary><b>Or paste CSV text</b></summary>
        <textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder="SKU,Name,Wholesale,MSRP…" aria-label="Paste CSV" />
        <button type="button" className="btn ghost sm" disabled={!paste.trim()} onClick={() => { setPending(x => [...x, prep('Pasted text', paste)]); setPaste('') }}>Read pasted text</button>
      </details>

      {pending.map(x => (
        <PendingFile key={x.id} x={x}
          onChange={nx => patch(x.id, () => nx)}
          onSheet={sheet => void chooseSheet(x.id, x.book!.wb, sheet)}
          onShowHidden={show => {
            // Hiding the sheets again also drops a hidden sheet that was chosen.
            const chosen = x.book!.sheet !== null && x.book!.wb.sheets[x.book!.sheet].hidden
            if (!show && chosen) void chooseSheet(x.id, x.book!.wb, null)
            patch(x.id, y => ({ ...y, book: { ...y.book!, showHidden: show } }))
          }}
          onCancel={() => setPending(ps => ps.filter(y => y.id !== x.id))}
          onImport={rows => {
            const m = mergeImport(p.products, p.components, x.kind, rows, p.settings, uuid)
            const before = { products: p.products, components: p.components, imports: p.imports }
            const sheetName = x.book && x.book.wb.sheets.length > 1 && x.book.sheet !== null ? x.book.wb.sheets[x.book.sheet].name : ''
            update({ products: m.products, components: m.components, imports: [...p.imports, { id: uuid(), kind: x.kind, fileName: sheetName ? `${x.fileName} (${sheetName})` : x.fileName, rows: rows.length, skipped: x.table.length - 1 - rows.length, at: Date.now() }] })
            setPending(ps => ps.filter(y => y.id !== x.id))
            toast(`${KIND_LABEL[x.kind]}: ${m.added} added, ${m.updated} updated`, { undo: () => update(before), action: pending.length === 1 ? { label: 'View catalog', run: () => go(`/app/p/${p.id}`) } : undefined })
          }} />
      ))}

      {p.imports.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h2>Import log</h2></div>
          <ul className="snap-list">
            {[...p.imports].reverse().map(im => <li key={im.id}><div><b>{im.fileName}</b><span className="muted small">{KIND_LABEL[im.kind]} · {im.rows} rows{im.skipped ? `, ${im.skipped} skipped` : ''} · {fmtDate(im.at)}</span></div></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function PendingFile({ x, onChange, onSheet, onShowHidden, onCancel, onImport }: { x: Pending; onChange(p: Pending): void; onSheet(sheet: number | null): void; onShowHidden(show: boolean): void; onCancel(): void; onImport(rows: ReturnType<typeof validate>['rows']): void }) {
  const headers = x.table[0] ?? []
  const v = useMemo(() => validate(x.table, x.kind, x.map), [x])
  const errors = v.issues.filter(i => i.level === 'error'), warns = v.issues.filter(i => i.level === 'warn')
  const fields = KIND_FIELDS[x.kind]
  const picker = x.book && x.book.wb.sheets.length > 1 ? x.book : null
  const offered = x.book ? x.book.wb.sheets.filter(s => s.rows > 0 && (!s.hidden || x.book!.showHidden)).length : 0
  // Until a worksheet is chosen (or while it loads) there is nothing to detect, map or import.
  if (x.book && (x.book.sheet === null || x.book.loading)) return (
    <div className="pending">
      <div className="row between wrap gap"><div><b>{x.fileName}</b> <span className="muted small">{x.book.wb.sheets.length} worksheets</span></div></div>
      <SheetPicker book={x.book} onSheet={onSheet} onShowHidden={onShowHidden} />
      <p className="report warn" role="status">{x.book.loading ? 'Reading the worksheet…' : offered > 1 ? 'This workbook has more than one worksheet with data. Choose the one to import.' : offered === 1 ? 'The only worksheet with data is hidden. Choose it to import.' : 'No visible worksheet has data. Show the hidden sheets to import one.'}</p>
      <div className="row gap-sm end"><button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button></div>
    </div>
  )
  return (
    <div className="pending">
      <div className="row between wrap gap">
        <div><b>{x.fileName}</b> <span className="muted small">{x.table.length - 1} rows · {headers.length} columns</span></div>
        <label className="ctl inline">Detected as
          <select value={x.kind} onChange={e => { const kind = e.target.value as Kind; onChange({ ...x, kind, map: guessMapping(headers, kind) }) }}>
            {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      {picker && <SheetPicker book={picker} onSheet={onSheet} onShowHidden={onShowHidden} />}
      <div className="mapping">
        {fields.map(f => (
          <label key={f} className="map-row">
            <span>{FIELD_LABEL[f]}{REQUIRED[x.kind].includes(f) && <span className="req" aria-label="required">*</span>}</span>
            <select value={x.map[f] ?? ''} onChange={e => { const m = { ...x.map }; if (e.target.value === '') delete m[f]; else m[f as Field] = Number(e.target.value); onChange({ ...x, map: m }) }}>
              <option value="">Not in this file</option>
              {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select>
            <small className="sample">{x.map[f] !== undefined ? (ex => ex ? `e.g. ${ex}` : 'empty in the first rows')(x.table.slice(1, 50).map(r => r[x.map[f]!]?.trim()).find(Boolean)) : ''}</small>
          </label>
        ))}
      </div>
      <div className={`report ${errors.length && !v.rows.length ? 'bad' : errors.length || warns.length ? 'warn' : 'good'}`} role="status">
        <b>{v.rows.length} rows ready</b>{v.skipped ? `, ${v.skipped} skipped` : ''}{errors.length ? `, ${errors.length} errors` : ''}{warns.length ? `, ${warns.length} warnings` : ''}.
        {v.issues.length > 0 && (
          <ul className="issues">
            {v.issues.slice(0, 12).map((i, k) => <li key={k}><span className="mono">line {i.line}</span>{i.message}</li>)}
            {v.issues.length > 12 && <li className="muted">and {v.issues.length - 12} more</li>}
          </ul>
        )}
      </div>
      <div className="row gap-sm end">
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary sm" disabled={!v.rows.length} onClick={() => onImport(v.rows)}>Import {v.rows.length} rows</button>
      </div>
    </div>
  )
}

function SheetPicker({ book, onSheet, onShowHidden }: { book: Book; onSheet(sheet: number | null): void; onShowHidden(show: boolean): void }) {
  const { sheets } = book.wb
  const hiddenWithData = sheets.filter(s => s.hidden && s.rows > 0).length
  const label = (s: (typeof sheets)[number]) => `${s.name}${s.hidden ? ' (hidden)' : ''} · ${s.unreadable ? 'cannot be read' : s.rows === 0 ? 'empty' : `${s.rows - 1} rows`}`
  return (
    <div className="row between wrap gap">
      <label className="ctl inline">Worksheet
        <select value={book.sheet ?? ''} onChange={e => onSheet(e.target.value === '' ? null : Number(e.target.value))}>
          {book.sheet === null && <option value="">Choose a worksheet…</option>}
          {sheets.map((s, i) => (!s.hidden || book.showHidden) && <option key={i} value={i} disabled={s.unreadable || s.rows === 0}>{label(s)}</option>)}
        </select>
      </label>
      {hiddenWithData > 0 && <label className="check small"><input type="checkbox" checked={book.showHidden} onChange={e => onShowHidden(e.target.checked)} /> Show {hiddenWithData} hidden {hiddenWithData === 1 ? 'sheet' : 'sheets'}</label>}
    </div>
  )
}
