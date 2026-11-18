// Hand-written spec for task 4.2 (Trash), the task's Manual check: trash an
// image → its pinned preview URL 404s → Restore from the Trash page → the URL
// works again → Delete forever → gone. Also covers the "Empty trash" flow and
// folder trashing hiding its contents. With a files domain, 6.3 moves the
// bucket objects too; that half is covered by tests/Trash.test.ts and the
// manual R2 check, since the suite has no bucket. `guren browser:map` rewrites
// generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(background = '#3b82f6'): Promise<Buffer> {
  return sharp({ create: { width: 480, height: 320, channels: 3, background } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}.jpg`
}

function imageCard(page: Page, name: string) {
  return page.locator('main li').filter({ has: page.locator(`img[alt="${name}"]`) })
}

/** Uploads one image and returns its pinned preview URL, taken from the POST answer. */
async function uploadAndGetUrl(page: Page, name: string): Promise<string> {
  let view = ''
  page.on('response', async (response) => {
    if (response.request().method() !== 'POST' || !response.url().endsWith('/uploads') || response.status() !== 201) return
    const body = await response.json() as { image: { urls: { view: string } } }
    view = body.image.urls.view
  })
  const file: BrowserFile = { name, mimeType: 'image/jpeg', buffer: await jpegBytes() }
  await page.goto('/files')
  await reviewAndUpload(page, [file])
  await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })
  return new URL(view, page.url()).toString()
}

/** The status a request for a URL gets. The subject is either the private
 *  preview (needs the owner's session, as the grid does) or a bucket URL,
 *  which must answer with no session at all. */
async function publicStatus(page: Page, url: string): Promise<number> {
  if (new URL(url).pathname.startsWith('/preview/')) {
    const response = await page.request.get(url)
    return response.status()
  }
  const cookieFree = await page.context().browser()!.newContext()
  const response = await cookieFree.request.get(url)
  await cookieFree.close()
  return response.status()
}

test.describe('trash', () => {
  test.use({ storageState: AUTH_FILE })

  test('trash 404s the link, Restore brings it back, Delete forever removes it', async ({ page }) => {
    const name = uniqueName('trash-me')
    const permanent = await uploadAndGetUrl(page, name)
    expect(await publicStatus(page, permanent)).toBe(200)

    // Trash from the card's menu.
    const card = imageCard(page, name)
    await card.hover()
    await card.getByRole('button', { name: `More actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Move to trash' }).click()

    // The AC: the public link 404s immediately, on the drive page too.
    await expect(page.locator(`img[alt="${name}"]`)).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => publicStatus(page, permanent)).toBe(404)

    // It is listed in the Trash; Restore brings the link back.
    await page.goto('/trash')
    const row = page.locator('main li').filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/trash-before.png`, fullPage: true })
    await row.getByRole('button', { name: 'Restore' }).click()
    await expect(page.locator('main li').filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => publicStatus(page, permanent)).toBe(200)

    // Trash it again and Delete forever: the link is gone for good.
    await page.goto('/files')
    const card2 = imageCard(page, name)
    await card2.hover()
    await card2.getByRole('button', { name: `More actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Move to trash' }).click()
    await expect(page.locator(`img[alt="${name}"]`)).toHaveCount(0, { timeout: 15_000 })

    await page.goto('/trash')
    const row2 = page.locator('main li').filter({ hasText: name })
    await row2.getByRole('button', { name: 'Delete forever' }).click()
    const confirm = page.getByRole('dialog', { name: /Delete .* forever/ })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete forever' }).click()
    await expect(page.locator('main li').filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => publicStatus(page, permanent)).toBe(404)
  })

  test('trashing a folder hides its contents; Empty trash clears the rest', async ({ page }) => {
    const folderName = `Trash folder ${Date.now()}`
    const imageName = uniqueName('inside-folder')

    await page.goto('/files')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New folder' }).click()
    const dialog = page.getByRole('dialog', { name: 'New folder' })
    await dialog.getByLabel('Name').fill(folderName)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await page.getByRole('link', { name: folderName }).first().click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)

    const file: BrowserFile = { name: imageName, mimeType: 'image/jpeg', buffer: await jpegBytes('#ef4444') }
    await reviewAndUpload(page, [file])
    await expect(page.locator(`img[alt="${imageName}"]`)).toBeVisible({ timeout: 30_000 })

    // Trash the folder from the drive: it leaves the grid.
    await page.goto('/files')
    const folderCard = page.locator('main li').filter({ has: page.getByRole('link', { name: folderName }) })
    await folderCard.hover()
    await folderCard.getByRole('button', { name: `More actions for folder ${folderName}` }).click()
    await page.getByRole('menuitem', { name: 'Move to trash' }).click()
    await expect(page.getByRole('link', { name: folderName })).toHaveCount(0, { timeout: 15_000 })

    // Trash shows the folder; Empty trash removes everything.
    await page.goto('/trash')
    await expect(page.locator('main li').filter({ hasText: folderName })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Empty trash' }).click()
    const confirm = page.getByRole('dialog', { name: /Empty the Trash/ })
    await confirm.getByRole('button', { name: 'Empty trash' }).click()
    await expect(page.getByText('Trash is empty')).toBeVisible({ timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/trash-empty.png`, fullPage: true })
  })
})
