import type { ChannelFees, ChannelId, Settings } from './model.ts'

/** Date the default fee table was last checked against the sources below. */
export const FEES_CHECKED = '2026-11-08'

export interface FeeSource { channel: ChannelId | 'all'; item: string; value: string; source: string; url: string }

// Defaults are deliberately editable per project: marketplaces change fees, and payout speed changes processing.
export const FEE_SOURCES: FeeSource[] = [
  { channel: 'faireNew', item: 'Commission, first order from a retailer Faire introduced (North America)', value: '15%', source: 'Faire Help Centre, "Faire\'s fees for brands" (summarised Oct 2026)', url: 'https://www.faire.com/support/articles/360024837351' },
  { channel: 'faireNew', item: 'One-time fee on a new retailer\'s first order', value: '$10', source: 'Faire Help Centre (as summarised by eightx.co, 2026)', url: 'https://eightx.co/blog/faire-wholesale-take-rate-margin-impact' },
  { channel: 'faireNew', item: 'Referral fee for brands outside North America, first order', value: '+10% (25% total)', source: 'Faire Help Centre article 360040446591', url: 'https://www.faire.com/support/articles/360040446591' },
  { channel: 'faireReorder', item: 'Commission on reorders from marketplace retailers', value: '15%', source: 'Faire Help Centre', url: 'https://www.faire.com/support/articles/360024837351' },
  { channel: 'faireDirect', item: 'Commission on retailers you bring via Faire Direct', value: '0%', source: 'Faire Help Centre, Faire Direct', url: 'https://www.faire.com/support/articles/360031800672' },
  { channel: 'all', item: 'Faire payment processing (varies by payout speed and shop location)', value: '≈3% of order', source: 'Faire Help Centre article 360006915532; third-party reports range 1.9–3.5%', url: 'https://www.faire.com/support/articles/360006915532' },
  { channel: 'etsy', item: 'Transaction fee (item price + shipping + gift wrap)', value: '6.5%', source: 'Etsy Fees & Payments Policy', url: 'https://www.etsy.com/legal/fees/' },
  { channel: 'etsy', item: 'Listing fee, renews on each sale', value: '$0.20', source: 'Etsy Fees & Payments Policy', url: 'https://www.etsy.com/legal/fees/' },
  { channel: 'etsy', item: 'Etsy Payments processing (US)', value: '3% + $0.25', source: 'Etsy Payments policy', url: 'https://www.etsy.com/legal/etsy-payments/' },
  { channel: 'etsy', item: 'Offsite Ads on attributed orders (shops under $10k/yr; 12% above)', value: '15%', source: 'Etsy Offsite Ads', url: 'https://www.etsy.com/legal/fees/' },
  { channel: 'dtc', item: 'Shopify Payments online card rate, Basic plan (US)', value: '2.9% + $0.30', source: 'Shopify pricing', url: 'https://www.shopify.com/pricing' },
]

const ch = (p: Partial<ChannelFees>): ChannelFees => ({ enabled: true, commission: 0, processing: 0, perOrder: 0, perUnit: 0, adsRate: 0, adsShare: 0, fulfilment: 0, aov: 100, ...p })

export function defaultFees(): Record<ChannelId, ChannelFees> {
  return {
    dtc: ch({ processing: 0.029, perOrder: 0.30, fulfilment: 1.25, aov: 48 }),
    etsy: ch({ commission: 0.065, processing: 0.03, perOrder: 0.25, perUnit: 0.20, adsRate: 0.15, adsShare: 0.12, fulfilment: 1.25, aov: 38 }),
    faireNew: ch({ commission: 0.15, processing: 0.03, perOrder: 10, aov: 220 }),
    faireReorder: ch({ commission: 0.15, processing: 0.03, aov: 260 }),
    faireDirect: ch({ commission: 0, processing: 0.03, aov: 260 }),
    direct: ch({ processing: 0, aov: 400 }),
  }
}

export function defaultSettings(): Settings {
  return {
    labourRate: 22,
    overheadMonthly: 900,
    unitsPerMonth: 600,
    strategy: { kind: 'keystone', multiple: 2 },
    retailMarkup: 2,
    rounding: 'whole',
    fees: defaultFees(),
    feesCheckedOn: FEES_CHECKED,
    orderMinimum: 100,
    firstOrderValue: 220,
    reorderValue: 260,
    reorderRate: 0.45,
    reordersPerYear: 3,
    years: 2,
    terms: 'Net 60 through Faire. Direct orders: 50% deposit, balance before shipping. Ships in 5–7 business days.',
    thinMargin: 0.15,
  }
}
