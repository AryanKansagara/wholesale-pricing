import { expect, test as base, type Page } from '@playwright/test'

// Hosts the app tries to reach on page load (web fonts). Everything off-origin is aborted, and any other
// host (Supabase, analytics, anything new) fails the test, so the suite runs signed out and offline.
const ALLOWED_BLOCKED = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

export const test = base.extend<{ page: Page }>({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin
    const blocked: string[] = []
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route(url => url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:', route => {
      blocked.push(new URL(route.request().url()).host)
      return route.abort()
    })
    await use(page)
    expect(errors, 'uncaught page errors').toEqual([])
    expect([...new Set(blocked)].filter(h => !ALLOWED_BLOCKED.has(h)), 'unexpected external hosts requested').toEqual([])
  },
})

export { expect }

/** Open a built-in sample brand from the empty workspace; resolves on its catalog. */
export async function openSample(page: Page, name: string) {
  await page.goto('/app')
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** Cells of a catalog row, by SKU: [sku, product, unit cost, wholesale, msrp, ...one per channel]. */
export const rowCells = (page: Page, sku: string) => page.getByRole('row', { name: new RegExp(`^${sku}\\b`) }).locator('td')
