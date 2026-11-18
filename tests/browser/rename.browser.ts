// Hand-written spec for task 2.2 (rename and details' rename half): the ⋮ menu
// rename on an image and a folder, F2 on the hovered card, the inline sibling
// clash error, and the AC itself — the permanent URL taken before the rename
// still serves the image afterwards, in a cookie-free context. The agent
// session has no interactive browser tooling, so this spec is the Manual
// check. `guren browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(background = '#10b981'): Promise<Buffer> {
  return sharp({ create: { width: 480, height: 320, channels: 3, background } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Uploads persist on the local database between runs, so names carry a unique suffix. */
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}.jpg`
}

interface PageImage {
  name: string
  urls: { view: string, thumb: string, permanent: string | null }
}

async function uploadOne(page: Page, name: string): Promise<void> {
  const file: BrowserFile = { name, mimeType: 'image/jpeg', buffer: await jpegBytes() }
  await reviewAndUpload(page, [file])
  await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })
}

/** The grid card (a list item) whose thumbnail is this image. */
function imageCard(page: Page, name: string) {
  return page.locator('li').filter({ has: page.locator(`img[alt="${name}"]`) })
}

/** ⋮ menu → Rename → new name → Enter, then wait for the new name. */
async function renameImageViaMenu(page: Page, oldName: string, newName: string): Promise<void> {
  const card = imageCard(page, oldName)
  await card.hover()
  await card.getByRole('button', { name: `More actions for ${oldName}` }).click()
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const input = page.getByRole('textbox', { name: `Rename ${oldName}` })
  await expect(input).toBeVisible()
  await input.fill(newName)
  await input.press('Enter')
  await expect(page.locator(`img[alt="${newName}"]`)).toBeVisible({ timeout: 15_000 })
}

async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('link', { name: name }).first()).toBeVisible({ timeout: 15_000 })
}

test.describe('rename', () => {
  test.use({ storageState: AUTH_FILE })

  test('⋮ rename keeps the old pinned preview URL working', async ({ page }) => {
    const original = uniqueName('rename-source')
    // The upload answer carries the object URLs: the page props after a full
    // load omit the deferred images (and a client visit never rewrites them).
    let uploaded: PageImage | undefined
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST' || !response.url().endsWith('/uploads') || response.status() !== 201) return
      const body = await response.json() as { image: PageImage }
      uploaded = body.image
    })

    await page.goto('/files')
    await uploadOne(page, original)
    await expect.poll(() => uploaded?.name).toBe(original)
    // No files domain in the browser suite, so the pinned link is the private
    // preview route (`/preview/{publicId}/{old-slug}.v1.webp`); the slug is
    // cosmetic, which is exactly what the rename must not break.
    const pinnedUrl = new URL(uploaded!.urls.view, page.url()).toString()
    expect(new URL(pinnedUrl).pathname.startsWith('/preview/')).toBe(true)

    const renamed = `renamed-${Date.now()}.jpg`
    await renameImageViaMenu(page, original, renamed)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rename-image.png`, fullPage: true })

    // The AC: the URL taken before the rename still serves the image bytes,
    // even though its slug now names nothing.
    const response = await page.request.get(pinnedUrl)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
    expect((await response.body()).length).toBeGreaterThan(0)
  })

  test('F2 renames the hovered folder inline', async ({ page }) => {
    const folderName = `Trips ${Date.now()}`
    const renamed = `${folderName} renamed`
    await page.goto('/files')
    await createFolder(page, folderName)

    const card = page.locator('li').filter({ has: page.getByRole('link', { name: folderName }) })
    await card.hover()
    await page.keyboard.press('F2')
    const input = page.getByRole('textbox', { name: `Rename ${folderName}` })
    await expect(input).toBeVisible()
    await input.fill(renamed)
    await input.press('Enter')

    await expect(page.getByRole('link', { name: renamed }).first()).toBeVisible({ timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rename-folder-f2.png`, fullPage: true })

    // The renamed folder still opens.
    await page.getByRole('link', { name: renamed }).first().click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)
    await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(renamed)).toBeVisible()
  })

  test('a sibling name clash shows an inline error', async ({ page }) => {
    const first = uniqueName('clash-a')
    const second = uniqueName('clash-b')
    await page.goto('/files')
    const files: BrowserFile[] = [
      { name: first, mimeType: 'image/jpeg', buffer: await jpegBytes('#ef4444') },
      { name: second, mimeType: 'image/jpeg', buffer: await jpegBytes('#3b82f6') },
    ]
    await reviewAndUpload(page, files)
    await expect(page.locator(`img[alt="${second}"]`)).toBeVisible({ timeout: 30_000 })

    const card = imageCard(page, second)
    await card.hover()
    await card.getByRole('button', { name: `More actions for ${second}` }).click()
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const input = page.getByRole('textbox', { name: `Rename ${second}` })
    await input.fill(first)
    await input.press('Enter')

    await expect(page.getByRole('alert')).toContainText('An image with this name already exists.', { timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rename-clash.png`, fullPage: true })

    // Esc backs out; both images keep their names.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('textbox', { name: /^Rename / })).toHaveCount(0)
    await expect(page.locator(`img[alt="${first}"]`)).toBeVisible()
    await expect(page.locator(`img[alt="${second}"]`)).toBeVisible()
  })
})
