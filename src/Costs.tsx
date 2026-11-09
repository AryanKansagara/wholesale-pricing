import { useMemo, useState } from 'react'
import { NumInput } from './charts.tsx'
import { blankProduct, type CatalogProduct } from './engine/catalog.ts'
import { slug } from './engine/csv.ts'
import { overheadPerUnit, unitCost, type Component } from './engine/model.ts'
import type { TabProps } from './Project.tsx'
import { uuid } from './store.ts'
import { Empty, fmtUsd, Modal, toast } from './ui.tsx'

export default function Costs({ p, update, setS }: TabProps) {
  const s = p.settings
  const [bomFor, setBomFor] = useState<string | null>(null)
  const used = useMemo(() => {
    const m = new Map<string, number>()
    for (const pr of p.products) for (const l of pr.bom) m.set(l.componentId, (m.get(l.componentId) ?? 0) + 1)
    return m
  }, [p.products])

  const setComp = (id: string, patch: Partial<Component>) => update({ components: p.components.map(c => c.id === id ? { ...c, ...patch } : c) })
  const setProd = (id: string, patch: Partial<CatalogProduct>) => update({ products: p.products.map(x => x.id === id ? { ...x, ...patch } : x) })
  const delComp = (c: Component) => {
    const before = { components: p.components, products: p.products }
    update({ components: p.components.filter(x => x.id !== c.id), products: p.products.map(x => ({ ...x, bom: x.bom.filter(l => l.componentId !== c.id) })) })
    toast(`Removed ${c.name} from ${used.get(c.id) ?? 0} recipes`, { undo: () => update(before) })
  }
  const delProd = (x: CatalogProduct) => {
    const before = p.products
    update({ products: p.products.filter(y => y.id !== x.id) })
    toast(`Deleted ${x.sku}`, { undo: () => update({ products: before }) })
  }
  const editing = p.products.find(x => x.id === bomFor)

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h2>Labour and overhead</h2><span className="muted small">Applies to every SKU unless overridden</span></div>
        <div className="controls flat">
          <label className="ctl">Labour rate<NumInput label="Labour rate per hour" prefix="$" suffix="/hr" step={1} value={s.labourRate} onChange={v => setS({ labourRate: v ?? 0 })} /></label>
          <label className="ctl">Monthly overhead<NumInput label="Monthly overhead" prefix="$" step={50} value={s.overheadMonthly} onChange={v => setS({ overheadMonthly: v ?? 0 })} /></label>
          <label className="ctl">Units made a month<NumInput label="Units made per month" step={10} value={s.unitsPerMonth} onChange={v => setS({ unitsPerMonth: v ?? 0 })} /></label>
          <div className="ctl">Overhead per unit<b className="big-num">{fmtUsd(overheadPerUnit(s))}</b></div>
        </div>
        <p className="muted small">Pay yourself a real wage here. Pricing on materials alone is how handmade brands end up losing money the moment a marketplace takes its cut.</p>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Shared components</h2><span className="muted small">Change a price once; every recipe that uses it updates</span></div>
        {p.components.length === 0 ? <p className="muted">No shared components yet. Import a bill of materials CSV or add them here.</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Component</th><th>Kind</th><th>Unit</th><th className="num">Cost per unit</th><th className="num">Used by</th><th /></tr></thead>
              <tbody>
                {p.components.map(c => (
                  <tr key={c.id}>
                    <td><input aria-label="Component name" value={c.name} onChange={e => setComp(c.id, { name: e.target.value })} /></td>
                    <td><select aria-label="Kind" value={c.kind} onChange={e => setComp(c.id, { kind: e.target.value as Component['kind'] })}><option value="material">Material</option><option value="packaging">Packaging</option></select></td>
                    <td><input aria-label="Unit" className="w-sm" value={c.unit} onChange={e => setComp(c.id, { unit: e.target.value })} /></td>
                    <td className="num"><NumInput label={`${c.name} cost per ${c.unit}`} prefix="$" value={c.unitCost} onChange={v => setComp(c.id, { unitCost: v ?? 0 })} width={110} /></td>
                    <td className="num">{used.get(c.id) ?? 0}</td>
                    <td className="num"><button type="button" className="icon-btn xs danger" aria-label={`Delete ${c.name}`} onClick={() => delComp(c)}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="row gap-sm wrap add-row" onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const name = String(f.get('name')).trim()
          if (!name) return
          update({ components: [...p.components, { id: uuid(), name, kind: f.get('kind') as Component['kind'], unit: String(f.get('unit')) || 'each', unitCost: Number(f.get('cost')) || 0 }] })
          e.currentTarget.reset()
        }}>
          <input name="name" placeholder="New component, e.g. Amber jar" aria-label="New component name" required />
          <select name="kind" aria-label="Kind"><option value="material">Material</option><option value="packaging">Packaging</option></select>
          <input name="unit" placeholder="each" aria-label="Unit" className="w-sm" />
          <input name="cost" placeholder="0.00" inputMode="decimal" aria-label="Cost per unit" className="w-sm" />
          <button className="btn ghost sm">Add component</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Recipes</h2><span className="muted small">Flat costs plus shared components, per SKU</span></div>
        {p.products.length === 0 ? <Empty title="No products"><p className="muted">Import a catalog first, or add one below.</p></Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>SKU</th><th>Product</th><th className="num">Flat materials</th><th className="num">Flat packaging</th><th className="num">Labour min</th><th className="num">Overhead</th><th>Components</th><th className="num">Unit cost</th><th /></tr></thead>
              <tbody>
                {p.products.map(x => (
                  <tr key={x.id}>
                    <td className="mono">{x.sku}</td>
                    <td>{x.name}</td>
                    <td className="num"><NumInput label={`${x.sku} flat materials`} prefix="$" value={x.materials} onChange={v => setProd(x.id, { materials: v ?? 0 })} width={96} /></td>
                    <td className="num"><NumInput label={`${x.sku} flat packaging`} prefix="$" value={x.packaging} onChange={v => setProd(x.id, { packaging: v ?? 0 })} width={96} /></td>
                    <td className="num"><NumInput label={`${x.sku} labour minutes`} step={1} value={x.labourMinutes} onChange={v => setProd(x.id, { labourMinutes: v ?? 0 })} width={80} /></td>
                    <td className="num"><NumInput label={`${x.sku} overhead override`} prefix="$" value={x.overhead} onChange={v => setProd(x.id, { overhead: v })} width={96} /></td>
                    <td><button type="button" className="chip-btn" onClick={() => setBomFor(x.id)}>{x.bom.length ? `${x.bom.length} component${x.bom.length > 1 ? 's' : ''}` : 'Add components'}</button></td>
                    <td className="num strong">{fmtUsd(unitCost(x, p.components, s).total)}</td>
                    <td className="num"><button type="button" className="icon-btn xs danger" aria-label={`Delete ${x.sku}`} onClick={() => delProd(x)}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Leave overhead blank to use the allocation above ({fmtUsd(overheadPerUnit(s))}).</p>
        <form className="row gap-sm wrap add-row" onSubmit={e => {
          e.preventDefault()
          const name = String(new FormData(e.currentTarget).get('name')).trim()
          if (!name) return
          let sku = slug(name), n = 2
          while (p.products.some(x => x.sku === sku)) sku = `${slug(name)}-${n++}`
          update({ products: [...p.products, blankProduct(sku, name, uuid())] })
          e.currentTarget.reset()
        }}>
          <input name="name" placeholder="New product name" aria-label="New product name" required />
          <button className="btn ghost sm">Add product</button>
        </form>
      </div>

      <Modal open={!!editing} onClose={() => setBomFor(null)} title={editing ? `Bill of materials · ${editing.sku}` : ''} wide>
        {editing && <BomEditor product={editing} comps={p.components} onChange={bom => setProd(editing.id, { bom })} cost={unitCost(editing, p.components, s)} />}
      </Modal>
    </div>
  )
}

function BomEditor({ product, comps, onChange, cost }: { product: CatalogProduct; comps: Component[]; onChange(b: CatalogProduct['bom']): void; cost: ReturnType<typeof unitCost> }) {
  const byId = new Map(comps.map(c => [c.id, c]))
  const free = comps.filter(c => !product.bom.some(l => l.componentId === c.id))
  return (
    <div className="stack-sm">
      {product.bom.length === 0 && <p className="muted">No components yet. Add the jar, wax, label or box this product uses.</p>}
      {product.bom.map((l, i) => {
        const c = byId.get(l.componentId)
        return (
          <div key={l.componentId} className="bom-line">
            <span>{c?.name ?? 'Missing component'} <small className="muted">{c ? `${fmtUsd(c.unitCost)} / ${c.unit}` : ''}</small></span>
            <NumInput label={`Quantity of ${c?.name}`} value={l.qty} step={0.1} onChange={v => onChange(product.bom.map((x, j) => j === i ? { ...x, qty: v ?? 0 } : x))} suffix={c?.unit} width={130} />
            <b className="num">{fmtUsd((c?.unitCost ?? 0) * l.qty)}</b>
            <button type="button" className="icon-btn xs danger" aria-label="Remove line" onClick={() => onChange(product.bom.filter((_, j) => j !== i))}>&times;</button>
          </div>
        )
      })}
      {free.length > 0 && (
        <select aria-label="Add a component" value="" onChange={e => { if (e.target.value) onChange([...product.bom, { componentId: e.target.value, qty: 1 }]) }}>
          <option value="">+ Add a component…</option>
          {free.map(c => <option key={c.id} value={c.id}>{c.name} ({fmtUsd(c.unitCost)} / {c.unit})</option>)}
        </select>
      )}
      <p className="muted small">Unit cost now {fmtUsd(cost.total)}: materials {fmtUsd(cost.materials)}, packaging {fmtUsd(cost.packaging)}, labour {fmtUsd(cost.labour)}, overhead {fmtUsd(cost.overhead)}.</p>
    </div>
  )
}
