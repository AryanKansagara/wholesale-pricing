import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { buildXlsx, type TestSheet } from '../src/engine/xlsx-builder.ts'
import { expect, rowCells, test } from './test.ts'

const faireHeader = ['Product Name (English)', 'SKU', 'Wholesale Price (USD)', 'Retail Price (USD)', 'Minimum Order Quantity', 'Case Size']
const prices: TestSheet = {
  name: 'Prices & Cases \u00b7 Spring', // spaces, an entity and non-ASCII text
  rows: [
    faireHeader,
    ['Black Fig 8 oz candle', 'EW-08-FIG', 16, 32, 4, 4],
    ['Cedar & Smoke 8 oz candle', 'EW-08-CDR', 16, 32, 4, 4],
    ['Black Fig travel tin', 'EW-04-FIG', 7, 14, 6, 6],
    ['Wax melt trio', 'EW-MELT-3', 6, 12, 6, 6],
    ['Reed diffuser 100 ml', 'EW-DIF-100', 19, 38, 2, 2],
    ['Cloche matches', 'EW-MATCH', 4, 8, 12, 12],
  ],
}
const workbook = (sheets: TestSheet[]) => ({ name: 'price-list.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(buildXlsx(sheets)) })
// A cover sheet comes first, which is what used to be imported.
const multi = workbook([
  { name: 'Cover', rows: [['Ember & Wick Candle Studio'], ['Wholesale price list, spring 2026'], [''], ['Opening order minimum $100'], ['Orders: wholesale@ember-wick.example']] },
  prices,
  { name: 'Notes', inline: true, rows: [['Topic', 'Note'], ['Lead time', 'Ships in 5-7 business days'], ['Terms', 'Net 60 through Faire']] },
  { name: 'Internal costs', state: 'hidden', rows: [['SKU', 'Materials', 'Packaging', 'Labour minutes'], ['EW-08-FIG', 3.1, 2.3, 6]] },
  { name: 'Archive 2025', rows: [] },
])

async function newBrandOnImport(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Import your data' }).click()
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+\/import$/)
}
const upload = (page: Page, file: Parameters<ReturnType<Page['locator']>['setInputFiles']>[0]) => page.locator('input[type=file]').setInputFiles(file)
const optionTexts = (page: Page) => page.getByLabel('Worksheet').locator('option').allTextContents()

test('a workbook with several sheets asks which one, and imports only that sheet', async ({ page }) => {
  await newBrandOnImport(page)
  await upload(page, multi)
  const pending = page.locator('.pending')
  await expect(pending).toContainText('price-list.xlsx')

  // Nothing is read, mapped or importable until a sheet is chosen. Hidden sheets are not offered; empty ones cannot be picked.
  await expect(pending.locator('.report')).toContainText('Choose the one to import')
  await expect(pending.locator('.mapping')).toHaveCount(0)
  await expect(pending.getByRole('button', { name: /^Import/ })).toHaveCount(0)
  expect(await optionTexts(page)).toEqual(['Choose a worksheet…', 'Cover · 3 rows', 'Prices & Cases \u00b7 Spring · 6 rows', 'Notes · 2 rows', 'Archive 2025 · empty'])
  await expect(page.getByLabel('Worksheet').locator('option', { hasText: 'Archive 2025' })).toBeDisabled()

  await page.getByLabel('Worksheet').selectOption({ label: 'Prices & Cases \u00b7 Spring · 6 rows' })
  await expect(pending.getByLabel('Detected as')).toHaveValue('faire')
  await expect(pending.locator('.report')).toContainText('6 rows ready')
  await expect(pending.locator('.mapping .sample').first()).toContainText('EW-08-FIG')
  await pending.getByRole('button', { name: 'Import 6 rows' }).click()
  await expect(page.locator('.toast')).toContainText('Faire product export: 6 added, 0 updated')
  await expect(page.locator('.snap-list li')).toContainText('price-list.xlsx (Prices & Cases \u00b7 Spring)')

  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Catalog' }).click()
  await expect(page.locator('.kpi').first()).toContainText('6')
  await expect(rowCells(page, 'EW-04-FIG').nth(3)).toHaveText('$7.00')
  // Nothing from the Cover, Notes or hidden sheet became a product.
  await expect(page.getByRole('row', { name: /Ember & Wick Candle Studio|Lead time|Net 60/ })).toHaveCount(0)
})

test('changing the sheet reruns detection and mapping and keeps nothing from the previous one', async ({ page }) => {
  await newBrandOnImport(page)
  await upload(page, multi)
  const pending = page.locator('.pending')
  const pick = page.getByLabel('Worksheet')

  await pick.selectOption({ label: 'Prices & Cases \u00b7 Spring · 6 rows' })
  await expect(pending.getByLabel('Detected as')).toHaveValue('faire')
  await expect(pending.locator('.report')).toContainText('6 rows ready')

  // Notes has no SKU column: its own detection says so, with no trace of the product rows.
  await pick.selectOption({ label: 'Notes · 2 rows' })
  await expect(pending.getByLabel('Detected as')).toHaveValue('generic')
  await expect(pending.locator('.report')).toContainText('0 rows ready')
  await expect(pending.locator('.report')).toContainText('No column mapped to SKU.')
  await expect(pending).not.toContainText('EW-08-FIG')
  await expect(pending.getByRole('button', { name: /^Import/ })).toBeDisabled()
  // The mapping choices now come from the Notes headers.
  await expect(pending.locator('.mapping select').first().locator('option')).toHaveText(['Not in this file', 'Topic', 'Note'])

  // The cover sheet has a single column of text.
  await pick.selectOption({ label: 'Cover · 3 rows' })
  await expect(pending).toContainText('1 columns')
  await expect(pending.locator('.report')).toContainText('No column mapped to SKU.')

  await pick.selectOption({ label: 'Prices & Cases \u00b7 Spring · 6 rows' })
  await expect(pending.locator('.report')).toContainText('6 rows ready')
  await expect(pending.getByRole('button', { name: 'Import 6 rows' })).toBeEnabled()
})

test('hidden sheets are offered only when asked for', async ({ page }) => {
  await newBrandOnImport(page)
  await upload(page, multi)
  const pending = page.locator('.pending')
  const pick = page.getByLabel('Worksheet')
  expect(await optionTexts(page)).not.toContainEqual(expect.stringContaining('Internal costs'))

  await pending.getByLabel('Show 1 hidden sheet').check()
  expect(await optionTexts(page)).toContain('Internal costs (hidden) · 1 rows')
  await pick.selectOption({ label: 'Internal costs (hidden) · 1 rows' })
  await expect(pending.getByLabel('Detected as')).toHaveValue('costsheet')
  await expect(pending.locator('.report')).toContainText('1 rows ready')

  // Hiding them again drops a hidden choice instead of keeping its rows.
  await pending.getByLabel('Show 1 hidden sheet').uncheck()
  await expect(pending.locator('.report')).toContainText('Choose the one to import')
  await expect(pending.locator('.mapping')).toHaveCount(0)
  expect(await optionTexts(page)).not.toContainEqual(expect.stringContaining('Internal costs'))
})

test('one sheet with data is used straight away, and a single-sheet file shows no picker', async ({ page }) => {
  await newBrandOnImport(page)
  // Several sheets, only one with data: no choice to make.
  await upload(page, workbook([{ name: 'Blank cover', rows: [] }, prices, { name: 'Spare', rows: [] }]))
  let pending = page.locator('.pending')
  await expect(pending.locator('.report')).toContainText('6 rows ready')
  await expect(pending.getByLabel('Worksheet')).toHaveValue('1')
  await expect(pending.getByLabel('Worksheet').locator('option[disabled]')).toHaveCount(2)
  await pending.getByRole('button', { name: 'Cancel' }).click()

  // Exactly one sheet: nothing changes for the user.
  await upload(page, workbook([{ name: 'Only', rows: prices.rows }]))
  pending = page.locator('.pending')
  await expect(pending.locator('.report')).toContainText('6 rows ready')
  await expect(pending.getByLabel('Worksheet')).toHaveCount(0)
  await pending.getByRole('button', { name: 'Import 6 rows' }).click()
  await expect(page.locator('.snap-list li')).toContainText('price-list.xlsx')
  await expect(page.locator('.snap-list li')).not.toContainText('Only')
})

test('the existing Faire export opens on its Products sheet with no extra step', async ({ page }) => {
  await newBrandOnImport(page)
  await upload(page, 'src/engine/fixtures/faire-products.xlsx')
  const pending = page.locator('.pending')
  await expect(pending.getByLabel('Detected as')).toHaveValue('faire')
  await expect(pending.locator('.report')).toContainText('4 rows ready')
  await expect(pending.getByLabel('Worksheet').locator('option:checked')).toHaveText('Products · 4 rows')
  await pending.getByRole('button', { name: 'Import 4 rows' }).click()
  await expect(page.locator('.toast')).toContainText('Faire product export: 4 added, 0 updated')
  await page.getByRole('navigation', { name: 'Brand sections' }).getByRole('link', { name: 'Catalog' }).click()
  await expect(page.getByRole('row', { name: /EW-04-FIG/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /EW-DIF-100/ })).toBeVisible()
})

test('empty or damaged workbooks give a message and import nothing', async ({ page }) => {
  await newBrandOnImport(page)
  const toasts = page.locator('.toast')

  await upload(page, { ...workbook([{ name: 'A', rows: [] }, { name: 'B', rows: [] }]), name: 'blank.xlsx' })
  await expect(toasts.last()).toContainText('blank.xlsx: Every worksheet in this workbook is empty.')

  const truncated = readFileSync('src/engine/fixtures/faire-products.xlsx').subarray(0, 900)
  await upload(page, { name: 'cut-off.xlsx', mimeType: 'application/octet-stream', buffer: truncated })
  await expect(toasts.last()).toContainText('cut-off.xlsx: Not an .xlsx file')

  await upload(page, 'e2e/fixtures/corrupt.xlsx')
  await expect(toasts.last()).toContainText('corrupt.xlsx: Not an .xlsx file')

  await expect(page.locator('.pending')).toHaveCount(0)
  await expect(page.locator('.snap-list')).toHaveCount(0)
  // The page still works afterwards.
  await upload(page, multi)
  await expect(page.getByLabel('Worksheet')).toBeVisible()
})
