import { useMemo } from 'react'
import { defaultSettings } from './engine/fees.ts'
import { analyse, orderEconomics, snapshotRows, type Snapshot, type Tier } from './engine/model.ts'
import { SAMPLES } from './engine/sample.ts'
import { getDefaults, getProjects, saveProject, useProjects, uuid, type Brand, type Project } from './store.ts'

const brand = (): Brand => ({ tagline: '', email: '', website: '', leadTime: 'Ships in 5–7 business days' })
export const emptyTier = (): Tier => ({ swaps: {}, labourCut: 0, packaging: null })

export async function createSampleProject(sampleId: string): Promise<Project> {
  const existing = getProjects().find(p => p.sampleId === sampleId)
  if (existing) return existing
  const b = SAMPLES.find(s => s.id === sampleId)!.build()
  const now = Date.now()
  let p: Project = {
    id: uuid(), name: b.name, createdAt: now, updatedAt: now, sampleId,
    settings: b.settings, components: b.components, products: b.products, tier: b.tier,
    brand: { ...brand(), tagline: b.blurb.split('.')[0] + '.', email: `wholesale@${b.id}.example`, website: `${b.id}.example` },
    snapshots: [], imports: [],
  }
  // A dated baseline snapshot so the History tab has something to compare from day one.
  p = { ...p, snapshots: [takeSnapshot(p, 'Imported prices')] }
  return saveProject(p)
}

export async function createBlankProject(name: string): Promise<Project> {
  const d = getDefaults()
  const s = defaultSettings()
  Object.assign(s, { labourRate: d.labourRate, orderMinimum: d.orderMinimum, rounding: d.rounding, retailMarkup: d.retailMarkup })
  const now = Date.now()
  return saveProject({ id: uuid(), name, createdAt: now, updatedAt: now, settings: s, components: [], products: [], tier: emptyTier(), brand: brand(), snapshots: [], imports: [] })
}

export function takeSnapshot(p: Project, label: string): Snapshot {
  return { id: uuid(), label, at: Date.now(), rows: snapshotRows(analyse(p.products, p.components, p.settings)), fees: structuredClone(p.settings.fees), labourRate: p.settings.labourRate }
}

export function useProject(id: string) {
  const list = useProjects()
  return list === null ? null : list.find(p => p.id === id)
}

export function useAnalysis(p: Project | undefined | null, withTier = false) {
  return useMemo(() => {
    if (!p) return null
    const results = analyse(p.products, p.components, p.settings, withTier ? p.tier : undefined)
    return { results, econ: orderEconomics(results, p.settings) }
  }, [p, withTier])
}
