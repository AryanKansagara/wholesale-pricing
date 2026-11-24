import { expect, rowCells, test } from './test.ts'
import type { Page } from '@playwright/test'

const catalog = 'src/engine/fixtures/shopify-2024-export.csv' // existing real-layout Shopify fixture
const costSheet = 'e2e/fixtures/cost-sheet.csv'

async function newBrandOnImport(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Import your data' }).click()
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+\/import$/)
}
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name })
const upload = (page: Page, file: string) => page.locator('input[type=file]').setInputFiles(file)

test('imports a catalog and a cost sheet through to pricing', async ({ page }) => {
  await newBrandOnImport(page)

  await upload(page, catalog)
  const pending = page.locator('.pending')
  await expect(pending).toContainText('shopify-2024-export.csv')
  await expect(pending.getByLabel('Detected as')).toHaveValue('shopify')
  await expect(pending.locator('.report')).toContainText('3 rows ready')
  await pending.getByRole('button', { name: 'Import 3 rows' }).click()
  await expect(page.locator('.toast')).toContainText('Shopify product export: 3 added, 0 updated')

  await upload(page, costSheet)
  await expect(page.locator('.pending').getByLabel('Detected as')).toHaveValue('costsheet')
  await expect(page.locator('.pending .report')).toContainText('3 rows ready')
  await page.locator('.pending').getByRole('button', { name: 'Import 3 rows' }).click()
  await expect(page.locator('.toast').last()).toContainText('Cost sheet: 0 added, 3 updated')
  await expect(page.locator('.snap-list li')).toHaveCount(2)

  await tab(page, 'Catalog').click()
  await expect(page.locator('.kpi').first()).toContainText('3')
  // KC-MUG-OAT: unit cost 2.40 + 1.85 + 18 min at $22/h (6.60) + 1.50 overhead = $12.35.
  // No wholesale price in the file, so the keystone proposal applies: 12.35 x 2 x 2 = 49.40 -> $50 MSRP, $25 wholesale.
  // First Faire order: 25 - 3.75 - 0.75 - 1.136 - 12.35 = $7.01 (28%).
  const oat = rowCells(page, 'KC-MUG-OAT')
  await expect(oat.nth(1)).toContainText('Oatmeal Speckle Mug')
  await expect(oat.nth(1)).toContainText('proposed')
  await expect(oat.nth(2)).toHaveText('$12.35')
  await expect(oat.nth(3)).toHaveText('$25.00')
  await expect(oat.nth(4)).toHaveText('$50.00')
  await expect(oat.nth(7)).toHaveText('28%$7.01')
  // The lower-case SKU from a single-variant Shopify product matches its cost row by SKU.
  await expect(rowCells(page, 'bud-vase').nth(2)).toHaveText('$9.68')

  await tab(page, 'Pricing').click()
  await expect(page.getByRole('heading', { name: 'Current vs proposed' })).toBeVisible()
  await expect(page.getByRole('row', { name: /KC-MUG-OAT/ })).toContainText('$12.35')
})

test('a wrong-format or unreadable file gets a message and the app stays usable', async ({ page }) => {
  await newBrandOnImport(page)
  const toasts = page.locator('.toast')

  await upload(page, 'e2e/fixtures/catalog.pdf')
  await expect(toasts.last()).toContainText('catalog.pdf: use a CSV or .xlsx file')

  await upload(page, 'e2e/fixtures/corrupt.xlsx')
  await expect(toasts.last()).toContainText('corrupt.xlsx: Not an .xlsx file')
  await expect(toasts.last()).toContainText('Save it as CSV and try again.')

  // A CSV with no SKU column is read but cannot be imported.
  await upload(page, 'e2e/fixtures/not-a-catalog.csv')
  const pending = page.locator('.pending')
  await expect(pending.locator('.report')).toContainText('No column mapped to SKU.')
  await expect(pending.locator('.report')).toContainText('0 rows ready')
  await expect(pending.getByRole('button', { name: /^Import/ })).toBeDisabled()

  // An empty file is not a success either.
  await pending.getByRole('button', { name: 'Cancel' }).click()
  await upload(page, 'e2e/fixtures/empty.csv')
  await expect(page.locator('.pending .report')).toContainText('0 rows ready')
  await expect(page.locator('.pending').getByRole('button', { name: /^Import/ })).toBeDisabled()
  await page.locator('.pending').getByRole('button', { name: 'Cancel' }).click()

  // Nothing was added, and a good file still imports afterwards.
  await expect(page.locator('.snap-list')).toHaveCount(0)
  await upload(page, catalog)
  await page.locator('.pending').getByRole('button', { name: 'Import 3 rows' }).click()
  await expect(toasts.last()).toContainText('3 added')
  await tab(page, 'Catalog').click()
  await expect(page.getByRole('row', { name: /KC-MUG-SEA/ })).toBeVisible()
})

test('a row with a negative price is rejected with its line number, not imported', async ({ page }) => {
  await newBrandOnImport(page)
  await upload(page, 'e2e/fixtures/negative-price.csv')
  const report = page.locator('.pending .report')
  await expect(report).toContainText('1 rows ready, 1 skipped, 1 errors.')
  await expect(report.locator('.issues li')).toHaveText('line 3Wholesale price is negative.')
  await page.locator('.pending').getByRole('button', { name: 'Import 1 rows' }).click()
  await tab(page, 'Catalog').click()
  await expect(page.getByRole('row', { name: /^CUP-1/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^CUP-2/ })).toHaveCount(0)
})
