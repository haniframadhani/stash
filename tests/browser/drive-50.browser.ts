// Manual-check spec for TASKS 1.5's 50-image acceptance: "50 seeded images
// scroll smoothly; view and sort survive a refresh". Skips itself when the
// database holds fewer than 50 images, so a fresh clone's suite stays green;
// seed the drive first with `bun scripts/seed-drive-images.ts 50`.
import { expect, test, type Page } from '@playwright/test'
import { AUTH_FILE } from './support'

const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

test.use({ storageState: AUTH_FILE })

async function openList(page: Page): Promise<number> {
  await page.goto('/files?view=list')
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  return page.locator('tbody tr').count()
}

test('50 images: list scrolls to the end, view and sort survive a refresh', async ({ page }) => {
  const total = await openList(page)
  test.skip(total < 50, `the drive holds ${total} images; run bun scripts/seed-drive-images.ts 50 first`)

  // Two header clicks walk name asc → desc → asc; the second click lands the
  // ascending order (the asc default keeps the URL clean) that we snapshot.
  await page.getByRole('button', { name: /^Sort by name/u }).click()
  await expect(page).toHaveURL(/order=desc/u)
  await page.getByRole('button', { name: /^Sort by name/u }).click()
  await expect(page).toHaveURL(/\/files\?view=list$/u)
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  const namesAsc = await page.locator('tbody tr td:nth-child(2)').allTextContents()
  expect(namesAsc.length).toBe(total)
  expect([...namesAsc].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))).toEqual(namesAsc)

  // Scroll the whole list: the last row renders under the sorted state.
  const lastRow = page.locator('tbody tr', { hasText: namesAsc.at(-1)! })
  await lastRow.scrollIntoViewIfNeeded()
  await expect(lastRow).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-50-bottom.png`, fullPage: false })

  // A refresh keeps the same rows in the same order.
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  const namesAfterReload = await page.locator('tbody tr td:nth-child(2)').allTextContents()
  expect(namesAfterReload).toEqual(namesAsc)

  // Over to the grid (all 50 lazy thumbnails) and back to list, through a
  // reload in between; the sort state rides the URL the whole time.
  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page).toHaveURL(/\/files$/u)
  await page.reload()
  await expect(page.locator('main img[alt]').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('main img[alt]')).toHaveCount(total, { timeout: 15_000 })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/grid-50.png`, fullPage: false })
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
})
