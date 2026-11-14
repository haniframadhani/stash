// Hand-written spec for the grid and list polish (TASKS 1.5): view toggle,
// sort with order, the ImageCard slots, skeletons and the URL-persisted state.
// `guren browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE } from './support'

const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

test.use({ storageState: AUTH_FILE })

/** Random-pixel JPEG: the stored WebP stays big, so size sorting has a clear
 *  top. 800×500 raw noise → ~1.2 MB → an incompressible stored version. */async function noiseJpeg(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let index = 0; index < raw.length; index++) raw[index] = Math.floor(Math.random() * 256)
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
}

async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#22c55e' } }).jpeg({ quality: 90 }).toBuffer()
}

async function uploadPair(page: Page): Promise<{ small: string, large: string }> {
  const stamp = Date.now()
  const small = `aaa-grid-${stamp}.jpg`
  const large = `zzz-grid-${stamp}.jpg`
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Upload images' }).click()
  await (await chooser).setFiles([
    { name: small, mimeType: 'image/jpeg', buffer: await solidJpeg(400, 280) },
    { name: large, mimeType: 'image/jpeg', buffer: await noiseJpeg(800, 500) },
  ])
  // The small one uploads first and toasts first; wait for the last toast.
  await expect(page.getByText(new RegExp(`${large.replace('.', '\\.')}: .+ → .+ \\(−\\d+%\\)$`, 'u'))).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator(`img[alt="${large}"]`)).toBeVisible({ timeout: 15_000 })
  return { small, large }
}

async function rowNames(page: Page): Promise<string[]> {
  return page.locator('tbody tr td:nth-child(2)').allTextContents()
}

test.describe('grid and list', () => {
  test('the grid renders ImageCards and the toolbar defaults', async ({ page }) => {
    await page.goto('/files')

    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: /^Sort: Name, ascending$/u })).toBeVisible()

    const { small } = await uploadPair(page)

    // Card anatomy (UI_SPEC §4): format badge on the thumb, hover checkbox,
    // the disabled ⋮ slot, the name below, and an explicit width/height so
    // nothing shifts while the thumb loads.
    const card = page.locator('main li', { has: page.locator(`img[alt="${small}"]`) })
    await expect(card.getByText('webp', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `More actions for ${small}` })).toBeDisabled()

    const box = card.locator('input[type="checkbox"]')
    await card.hover()
    await expect(box).toBeVisible()
    await box.check()
    await expect(box).toBeChecked()

    const img = card.locator('img')
    expect(await img.getAttribute('loading')).toBe('lazy')
    expect(await img.getAttribute('width')).toBeTruthy()
    expect(await img.getAttribute('height')).toBeTruthy()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/grid-cards.png`, fullPage: true })
  })

  test('list view toggles, persists over a refresh, and headers sort', async ({ page }) => {
    await page.goto('/files')
    const { small, large } = await uploadPair(page)

    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page).toHaveURL(/\/files\?view=list$/u)
    const table = page.getByRole('table')
    await expect(table).toBeVisible()

    // Columns per UI_SPEC §4, plus the stored format.
    const firstRow = table.locator('tbody tr').first()
    await expect(firstRow.locator('td').nth(2)).toHaveText(/^[a-z]+$/iu)
    await expect(firstRow.locator('td').nth(3)).toContainText('×')
    await expect(table.locator(`img[alt="${small}"]`)).toBeVisible()
    expect(await table.locator(`img[alt="${small}"]`).getAttribute('width')).toBe('40')

    // A refresh keeps the view (URL param).
    await page.reload()
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/files\?view=list$/u)

    // Name ascending: my aaa upload sorts first, zzz last — leftovers sit in
    // between ('aaa-' < 'blue…' < 'sunset…' < 'zzz-').
    let names = await rowNames(page)
    expect(names[0]!.startsWith('aaa-grid-')).toBe(true)
    expect(names.at(-1)!.startsWith('zzz-grid-')).toBe(true)

    // Click Size: ascending — the tiny solid upload sorts before the noise one
    // whatever else lives on this database.
    await page.getByRole('button', { name: /^Sort by size/u }).click()
    await expect(page).toHaveURL(/sort=size/u)
    names = await rowNames(page)
    expect(names.indexOf(large)).toBeGreaterThan(names.indexOf(small))

    // Click again: descending — the order flips.
    await page.getByRole('button', { name: /^Sort by size/u }).click()
    await expect(page).toHaveURL(/order=desc/u)
    names = await rowNames(page)
    expect(names.indexOf(large)).toBeLessThan(names.indexOf(small))

    // The toolbar menu drives the same state.
    await page.getByRole('button', { name: /^Sort: Size/u }).click()
    await page.getByRole('menuitemradio', { name: 'Modified' }).click()
    await expect(page).toHaveURL(/sort=modified/u)
    await expect(page).toHaveURL(/view=list/u)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-view.png`, fullPage: true })
  })

  test('the deferred grid shows skeletons until the partial reload lands', async ({ page }) => {
    // Hold only the images partial reload, so the skeleton state is observable.
    await page.route('**/files', async (route) => {
      if (route.request().headers()['x-inertia-partial-data'] === 'images') {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      await route.continue()
    })
    await page.goto('/files')

    await expect(page.locator('main .animate-pulse').first()).toBeVisible()
    await expect(page.locator('main img[alt]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('main .animate-pulse')).toHaveCount(0)
  })
})

test.describe('storage banner', () => {
  test('the drive shows the storage error state when /health reports storage down', async ({ page }) => {
    test.skip(
      process.env.STORAGE_DOWN !== '1',
      'run once with STORAGE_DOWN=1 and S3_ENDPOINT pointed at a dead port',
    )
    await page.goto('/files')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Storage is unreachable. Is your S3 service running?')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/storage-error-banner.png`, fullPage: true })
  })
})
