import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, openSample, test } from './test.ts'

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name })

async function downloadFrom(page: Page, heading: string) {
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: heading }) })
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /^Download/ }).click()])
  return { name: dl.suggestedFilename(), text: await readFile((await dl.path())!, 'utf8') }
}

test('downloads the Faire and Shopify price files with the expected rows', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await tab(page, 'Line sheet & exports').click()

  const faire = await downloadFrom(page, 'Faire price update')
  expect(faire.name).toMatch(/^ember-wick-candle-studio-faire-prices-\d{4}-\d\d-\d\d\.csv$/)
  expect(faire.text).toBe([
    'Product Name (English),SKU,Wholesale Price (USD),Retail Price (USD),Minimum Order Quantity,Case Size',
    'Black Fig 8 oz candle,EW-08-FIG,16.00,32.00,4,4',
    'Cedar & Smoke 8 oz candle,EW-08-CDR,16.00,32.00,4,4',
    'Black Fig travel tin,EW-04-FIG,7.00,14.00,6,6',
    'Wax melt trio,EW-MELT-3,6.00,12.00,6,6',
    'Reed diffuser 100 ml,EW-DIF-100,19.00,38.00,2,2',
    'Cloche matches,EW-MATCH,4.00,8.00,12,12',
    '',
  ].join('\n'))

  const shopify = await downloadFrom(page, 'Shopify price update')
  expect(shopify.name).toMatch(/^ember-wick-candle-studio-shopify-prices-\d{4}-\d\d-\d\d\.csv$/)
  expect(shopify.text).toBe([
    'Handle,Title,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Cost per item',
    'black-fig-8-oz-candle,Black Fig 8 oz candle,Title,Default Title,EW-08-FIG,32.00,,8.55',
    'cedar-smoke-8-oz-candle,Cedar & Smoke 8 oz candle,Title,Default Title,EW-08-CDR,32.00,,8.55',
    'black-fig-travel-tin,Black Fig travel tin,Title,Default Title,EW-04-FIG,14.00,,5.59',
    'wax-melt-trio,Wax melt trio,Title,Default Title,EW-MELT-3,12.00,,3.81',
    'reed-diffuser-100-ml,Reed diffuser 100 ml,Title,Default Title,EW-DIF-100,38.00,,11.73',
    'cloche-matches,Cloche matches,Title,Default Title,EW-MATCH,8.00,,2.88',
    '',
  ].join('\n'))
})

test('a price edit flows into the download', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await page.getByRole('row', { name: /^EW-04-FIG/ }).click()
  await page.getByRole('dialog', { name: /EW-04-FIG/ }).getByRole('textbox', { name: 'Wholesale price' }).fill('9')
  await page.keyboard.press('Escape')
  await tab(page, 'Line sheet & exports').click()
  const faire = await downloadFrom(page, 'Faire price update')
  expect(faire.text.split('\n')).toContain('Black Fig travel tin,EW-04-FIG,9.00,14.00,6,6')
})

test('the line sheet lists every SKU with its prices and an order form', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await tab(page, 'Line sheet & exports').click()
  await page.getByRole('link', { name: 'Open the line sheet' }).click()
  await expect(page).toHaveURL(/\/linesheet$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ember & Wick Candle Studio' })).toBeVisible()

  const tiles = page.locator('.tile')
  await expect(tiles).toHaveCount(6)
  await expect(tiles.filter({ hasText: 'EW-04-FIG' })).toContainText('Wholesale $7.00')
  await expect(tiles.filter({ hasText: 'EW-04-FIG' })).toContainText('MSRP $14.00')
  await expect(tiles.filter({ hasText: 'EW-04-FIG' })).toContainText('Case of 6 · MOQ 6')

  const rows = page.locator('.of-table tbody tr')
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(0)).toHaveText('EW-08-FIGBlack Fig 8 oz candle$16.0044')
  await expect(rows.nth(5)).toHaveText('EW-MATCHCloche matches$4.001212')
})
