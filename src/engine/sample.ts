// Synthetic brands. Every name and number here is invented; the shapes are typical of small makers on Faire.
import type { CatalogProduct } from './catalog.ts'
import { defaultSettings } from './fees.ts'
import type { Component, Settings, Tier } from './model.ts'

export interface SampleBrand {
  id: string
  name: string
  blurb: string
  settings: Settings
  components: Component[]
  products: CatalogProduct[]
  tier: Tier
}

type P = Omit<CatalogProduct, 'id' | 'caseSize' | 'moq' | 'materials' | 'packaging'> & Partial<Pick<CatalogProduct, 'caseSize' | 'moq' | 'materials' | 'packaging'>>
const prods = (prefix: string, list: P[]): CatalogProduct[] =>
  list.map((p, i) => ({ id: `${prefix}-${i + 1}`, caseSize: 1, moq: 1, materials: 0, packaging: 0, ...p }))
const comp = (id: string, name: string, unitCost: number, unit: string, kind: Component['kind'] = 'material'): Component => ({ id, name, unitCost, unit, kind })

function candles(): SampleBrand {
  const s = defaultSettings()
  Object.assign(s, { labourRate: 20, overheadMonthly: 1200, unitsPerMonth: 800, orderMinimum: 100, firstOrderValue: 220 })
  const components = [
    comp('wax', 'Soy wax', 0.18, 'oz'), comp('fo', 'Fragrance oil', 1.6, 'oz'), comp('wick', 'Cotton wick', 0.12, 'each'),
    comp('jar8', '8 oz amber jar + lid', 1.35, 'each', 'packaging'), comp('tin4', '4 oz travel tin', 0.62, 'each', 'packaging'),
    comp('label', 'Printed label', 0.18, 'each', 'packaging'), comp('giftbox', 'Rigid gift box', 0.95, 'each', 'packaging'),
    comp('kraft', 'Kraft sleeve', 0.32, 'each', 'packaging'), comp('clam', 'Wax melt clamshell', 0.28, 'each', 'packaging'),
    comp('reeds', 'Rattan reeds (8)', 0.55, 'set'), comp('bottle', '100 ml glass bottle', 1.9, 'each', 'packaging'), comp('base', 'Diffuser base', 0.04, 'ml'),
  ]
  const products = prods('ew', [
    { sku: 'EW-08-FIG', name: 'Black Fig 8 oz candle', category: 'Candles', bom: [{ componentId: 'wax', qty: 7.2 }, { componentId: 'fo', qty: 0.72 }, { componentId: 'wick', qty: 1 }, { componentId: 'jar8', qty: 1 }, { componentId: 'label', qty: 1 }, { componentId: 'giftbox', qty: 1 }], labourMinutes: 6, wholesale: 16, msrp: 32, dtcPrice: 34, etsyPrice: 34, caseSize: 4, moq: 4, mixWeight: 3 },
    { sku: 'EW-08-CDR', name: 'Cedar & Smoke 8 oz candle', category: 'Candles', bom: [{ componentId: 'wax', qty: 7.2 }, { componentId: 'fo', qty: 0.72 }, { componentId: 'wick', qty: 1 }, { componentId: 'jar8', qty: 1 }, { componentId: 'label', qty: 1 }, { componentId: 'giftbox', qty: 1 }], labourMinutes: 6, wholesale: 16, msrp: 32, dtcPrice: 32, etsyPrice: 32, caseSize: 4, moq: 4, mixWeight: 3 },
    { sku: 'EW-04-FIG', name: 'Black Fig travel tin', category: 'Candles', bom: [{ componentId: 'wax', qty: 3.6 }, { componentId: 'fo', qty: 0.36 }, { componentId: 'wick', qty: 1 }, { componentId: 'tin4', qty: 1 }, { componentId: 'label', qty: 1 }, { componentId: 'giftbox', qty: 1 }], labourMinutes: 3, wholesale: 7, msrp: 14, dtcPrice: 14, etsyPrice: 13, caseSize: 6, moq: 6, mixWeight: 4 },
    { sku: 'EW-MELT-3', name: 'Wax melt trio', category: 'Melts', bom: [{ componentId: 'wax', qty: 2.5 }, { componentId: 'fo', qty: 0.25 }, { componentId: 'clam', qty: 1 }, { componentId: 'label', qty: 1 }], labourMinutes: 3, wholesale: 6, msrp: 12, dtcPrice: 12, caseSize: 6, moq: 6, mixWeight: 2 },
    { sku: 'EW-DIF-100', name: 'Reed diffuser 100 ml', category: 'Home fragrance', bom: [{ componentId: 'base', qty: 80 }, { componentId: 'fo', qty: 0.7 }, { componentId: 'bottle', qty: 1 }, { componentId: 'reeds', qty: 1 }, { componentId: 'label', qty: 1 }, { componentId: 'giftbox', qty: 1 }], labourMinutes: 7, wholesale: 19, msrp: 38, dtcPrice: 38, etsyPrice: 34, caseSize: 2, moq: 2, mixWeight: 1 },
    { sku: 'EW-MATCH', name: 'Cloche matches', category: 'Accessories', materials: 0.95, packaging: 0.1, bom: [], labourMinutes: 1, wholesale: 4, msrp: 8, dtcPrice: 8, caseSize: 12, moq: 12, mixWeight: 1, competitorMsrp: 9 },
  ])
  return { id: 'ember-wick', name: 'Ember & Wick Candle Studio', blurb: 'Hand-poured soy candles. The 4 oz travel tin loses money on every first Faire order.', settings: s, components, products, tier: { swaps: { giftbox: 'kraft' }, labourCut: 0.25, packaging: null } }
}

function ceramics(): SampleBrand {
  const s = defaultSettings()
  Object.assign(s, { labourRate: 28, overheadMonthly: 1500, unitsPerMonth: 300, orderMinimum: 150, firstOrderValue: 320, reorderValue: 380, reorderRate: 0.5, strategy: { kind: 'margin', target: 0.5 } })
  s.fees.etsy.enabled = false
  const components = [
    comp('clay', 'Stoneware clay', 0.95, 'lb'), comp('glaze', 'Glaze (dip)', 0.6, 'oz'), comp('fire', 'Kiln firing share', 0.85, 'piece'),
    comp('wrap', 'Honeycomb wrap', 0.45, 'each', 'packaging'), comp('box', 'Printed mug box', 1.4, 'each', 'packaging'), comp('plainbox', 'Plain kraft box', 0.55, 'each', 'packaging'),
  ]
  // Labour is hands-on minutes per piece in batch production (throw, trim, handle, glaze, sand), not elapsed time.
  const pack = [{ componentId: 'wrap', qty: 1 }, { componentId: 'box', qty: 1 }]
  const products = prods('kc', [
    { sku: 'KC-MUG-OAT', name: 'Oatmeal speckle mug', category: 'Drinkware', bom: [{ componentId: 'clay', qty: 1.1 }, { componentId: 'glaze', qty: 2 }, { componentId: 'fire', qty: 1 }, ...pack], labourMinutes: 18, wholesale: 22, msrp: 44, dtcPrice: 46, caseSize: 2, moq: 4, mixWeight: 4 },
    { sku: 'KC-MUG-SEA', name: 'Seafoam drip mug', category: 'Drinkware', bom: [{ componentId: 'clay', qty: 1.1 }, { componentId: 'glaze', qty: 3 }, { componentId: 'fire', qty: 1 }, ...pack], labourMinutes: 21, wholesale: 24, msrp: 48, dtcPrice: 48, caseSize: 2, moq: 4, mixWeight: 3 },
    { sku: 'KC-BWL-SM', name: 'Small serving bowl', category: 'Tableware', bom: [{ componentId: 'clay', qty: 1.6 }, { componentId: 'glaze', qty: 3 }, { componentId: 'fire', qty: 1.4 }, { componentId: 'wrap', qty: 2 }], labourMinutes: 24, wholesale: 32, msrp: 64, dtcPrice: 62, caseSize: 2, moq: 2, mixWeight: 2 },
    { sku: 'KC-PLT-DIN', name: 'Dinner plate', category: 'Tableware', bom: [{ componentId: 'clay', qty: 2.4 }, { componentId: 'glaze', qty: 3.5 }, { componentId: 'fire', qty: 1.6 }, { componentId: 'wrap', qty: 2 }], labourMinutes: 27, wholesale: 38, msrp: 76, dtcPrice: 78, caseSize: 4, moq: 4, mixWeight: 1 },
    { sku: 'KC-SPR', name: 'Spoon rest', category: 'Kitchen', bom: [{ componentId: 'clay', qty: 0.5 }, { componentId: 'glaze', qty: 1 }, { componentId: 'fire', qty: 0.5 }, { componentId: 'wrap', qty: 1 }], labourMinutes: 8, wholesale: 12, msrp: 24, dtcPrice: 24, caseSize: 4, moq: 4, mixWeight: 2 },
    { sku: 'KC-BUD', name: 'Bud vase', category: 'Decor', bom: [{ componentId: 'clay', qty: 0.7 }, { componentId: 'glaze', qty: 1.5 }, { componentId: 'fire', qty: 0.7 }, ...pack], labourMinutes: 14, wholesale: 20, msrp: 40, dtcPrice: 38, caseSize: 2, moq: 2, mixWeight: 2 },
  ])
  return { id: 'kiln-clay', name: 'Kiln & Clay Ceramics', blurb: 'Wheel-thrown stoneware. Labour is most of the cost: at today\'s prices mugs lose money on Faire and barely clear direct wholesale.', settings: s, components, products, tier: { swaps: { box: 'plainbox' }, labourCut: 0.25, packaging: null } }
}

function stationery(): SampleBrand {
  const s = defaultSettings()
  Object.assign(s, { labourRate: 18, overheadMonthly: 600, unitsPerMonth: 2000, orderMinimum: 100, firstOrderValue: 180, reorderValue: 220, reorderRate: 0.55, reordersPerYear: 4, rounding: 'charm' })
  const components = [
    comp('card', 'A2 card stock + envelope', 0.32, 'each'), comp('print', 'Risograph print pass', 0.12, 'pass'), comp('sleeve', 'Cello sleeve', 0.05, 'each', 'packaging'),
    comp('nb', 'A5 notebook block', 1.85, 'each'), comp('cover', 'Letterpress cover', 0.9, 'each'), comp('a4', 'A4 art paper', 0.4, 'sheet'), comp('mailer', 'Rigid print mailer', 0.6, 'each', 'packaging'),
  ]
  const products = prods('pf', [
    { sku: 'PF-CARD-BDAY', name: 'Fern birthday card', category: 'Cards', bom: [{ componentId: 'card', qty: 1 }, { componentId: 'print', qty: 2 }, { componentId: 'sleeve', qty: 1 }], labourMinutes: 1, wholesale: 3, msrp: 6, dtcPrice: 6, etsyPrice: 6, caseSize: 6, moq: 6, mixWeight: 8 },
    { sku: 'PF-CARD-THX', name: 'Thank you card, set of 6', category: 'Cards', bom: [{ componentId: 'card', qty: 6 }, { componentId: 'print', qty: 6 }, { componentId: 'sleeve', qty: 1 }], labourMinutes: 4, wholesale: 9, msrp: 18, dtcPrice: 18, etsyPrice: 16, caseSize: 4, moq: 4, mixWeight: 3 },
    { sku: 'PF-NB-A5', name: 'Letterpress A5 notebook', category: 'Notebooks', bom: [{ componentId: 'nb', qty: 1 }, { componentId: 'cover', qty: 1 }, { componentId: 'sleeve', qty: 1 }], labourMinutes: 4, wholesale: 9, msrp: 18, dtcPrice: 19, etsyPrice: 19, caseSize: 4, moq: 4, mixWeight: 3 },
    { sku: 'PF-PRINT-A4', name: 'Botanical risograph print A4', category: 'Prints', bom: [{ componentId: 'a4', qty: 1 }, { componentId: 'print', qty: 3 }, { componentId: 'mailer', qty: 1 }], labourMinutes: 3, wholesale: 12, msrp: 24, dtcPrice: 24, etsyPrice: 22, caseSize: 3, moq: 3, mixWeight: 2 },
    { sku: 'PF-STK', name: 'Sticker sheet', category: 'Stickers', materials: 0.45, packaging: 0.05, bom: [], labourMinutes: 0.5, wholesale: 2.5, msrp: 5, dtcPrice: 5, caseSize: 10, moq: 10, mixWeight: 4 },
  ])
  return { id: 'paper-fern', name: 'Paper Fern Stationery', blurb: 'Riso cards and notebooks. Healthy margins; the question is the order minimum.', settings: s, components, products, tier: { swaps: { mailer: 'sleeve' }, labourCut: 0, packaging: null } }
}

export const SAMPLES: { id: string; name: string; blurb: string; build: () => SampleBrand }[] = [candles(), ceramics(), stationery()].map(b => ({ id: b.id, name: b.name, blurb: b.blurb, build: { 'ember-wick': candles, 'kiln-clay': ceramics, 'paper-fern': stationery }[b.id]! }))
