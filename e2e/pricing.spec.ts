import { expect, openSample, rowCells, test } from './test.ts'

// Expected figures are worked by hand from the sample's inputs and the default fee table
// (Faire first order: 15% commission + 3% processing + $10 per order spread over a $220 order), not read from the engine.
//   EW-08-FIG: wholesale $16.00, unit cost $8.548 -> 16 - 2.40 - 0.48 - 0.727 - 8.548 = $3.84 (24%)
//   EW-04-FIG: wholesale $7.00,  unit cost $5.594 ->  7 - 1.05 - 0.21 - 0.318 - 5.594 = -$0.17 (-2%)
const FIRST_ORDER = 7 // column after SKU, product, cost, wholesale, MSRP, DTC, Etsy

test('opens a sample and shows margin after fees', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  const fig = rowCells(page, 'EW-08-FIG')
  await expect(fig.nth(2)).toHaveText('$8.55')
  await expect(fig.nth(3)).toHaveText('$16.00')
  await expect(fig.nth(FIRST_ORDER)).toHaveText('24%$3.84')
  const tin = rowCells(page, 'EW-04-FIG')
  await expect(tin.nth(FIRST_ORDER)).toHaveText('-2%-$0.17')
  await expect(page.locator('.kpi.bad')).toContainText('Lose money on a first Faire order')
  await expect(page.locator('.kpi.bad b')).toHaveText('1')
  await expect(page.locator('.kpi.bad small')).toHaveText('EW-04-FIG')
})

test('changing a price changes the margin', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await rowCells(page, 'EW-08-FIG').first().click()
  const dialog = page.getByRole('dialog', { name: /EW-08-FIG/ })
  await dialog.getByRole('textbox', { name: 'Wholesale price' }).fill('18')
  await page.keyboard.press('Escape')
  // 18 - 2.70 - 0.54 - 0.818 - 8.548 = $5.39 (30%)
  await expect(rowCells(page, 'EW-08-FIG').nth(3)).toHaveText('$18.00')
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER)).toHaveText('30%$5.39')
  // Other SKUs are untouched.
  await expect(rowCells(page, 'EW-08-CDR').nth(FIRST_ORDER)).toHaveText('24%$3.84')
})

test('changing a fee changes the margin, and resetting restores it', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Channels & fees' }).click()
  await page.getByRole('textbox', { name: 'Faire, first order Commission' }).fill('20')
  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Catalog' }).click()
  // 16 - 3.20 - 0.48 - 0.727 - 8.548 = $3.04 (19%); the reorder channel keeps its own 15%.
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER)).toHaveText('19%$3.04')
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER + 1)).toHaveText('29%$4.57')

  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Channels & fees' }).click()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Catalog' }).click()
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER)).toHaveText('24%$3.84')
})

test('edits survive a reload', async ({ page }) => {
  await openSample(page, 'Ember & Wick Candle Studio')
  await rowCells(page, 'EW-08-FIG').first().click()
  await page.getByRole('dialog', { name: /EW-08-FIG/ }).getByRole('textbox', { name: 'Wholesale price' }).fill('18')
  await page.keyboard.press('Escape')
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER)).toHaveText('30%$5.39')

  await page.reload()
  await expect(rowCells(page, 'EW-08-FIG').nth(3)).toHaveText('$18.00')
  await expect(rowCells(page, 'EW-08-FIG').nth(FIRST_ORDER)).toHaveText('30%$5.39')

  // The brand is still listed, once, on the workspace page.
  await page.goto('/app')
  await expect(page.getByRole('heading', { level: 3, name: 'Ember & Wick Candle Studio' })).toHaveCount(1)
})
