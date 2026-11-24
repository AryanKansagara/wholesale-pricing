import { expect, test } from './test.ts'

// The shared fixture in ./test.ts aborts every off-origin request and fails a test on uncaught page errors
// or on a request to any host other than the web-font hosts. These tests just walk the signed-out app.

test('every page loads signed out with no backend and no page errors', async ({ page }) => {
  for (const [path, heading] of [['/', /price for wholesale/i], ['/docs', /getting your data in/i], ['/settings', /settings/i], ['/app', /your brands/i]] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
  }
  await page.goto('/nope')
  await expect(page.getByRole('heading', { name: 'This aisle is empty' })).toBeVisible()
})

test('an unknown brand id is a message, not a crash', async ({ page }) => {
  await page.goto('/app/p/does-not-exist')
  await expect(page.getByRole('heading', { name: 'Brand not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to brands' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your brands' })).toBeVisible()
})
