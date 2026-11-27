// Hand-written spec for task 3.1 (Replace image), its Manual check: replacing
// an image appends v2, the grid thumbnail switches to it, the old pinned link
// still serves the old bytes and the new one serves the new bytes. The old
// link is the private preview here because the browser suite has no files
// domain; the bucket URL half is covered by tests/controllers/ImageController
// .test.ts and tests/UrlBuilder.test.ts. `guren browser:map` rewrites
// generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload } from './support'

async function jpegBytes(background: string): Promise<Buffer> {
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

test.describe('replace image', () => {
  test.use({ storageState: AUTH_FILE })

  test('writes v2, refreshes the thumbnail and leaves the old link serving v1', async ({ page }) => {
    const name = uniqueName('replace-me')
    let v1View = ''
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST' || !response.url().endsWith('/uploads') || response.status() !== 201) return
      const body = await response.json() as { image: { urls: { view: string } } }
      v1View = body.image.urls.view
    })

    await page.goto('/files')
    await reviewAndUpload(page, [{ name, mimeType: 'image/jpeg', buffer: await jpegBytes('#ef4444') }])
    const card = imageCard(page, name)
    await expect(card).toBeVisible({ timeout: 30_000 })
    expect(v1View).toContain('.v1.webp')
    const v1Url = new URL(v1View, page.url()).toString()
    const v1Bytes = await (await page.request.get(v1Url)).body()
    const v1Thumb = (await card.locator('img').getAttribute('src'))!

    // Replace from the context menu: one file, the same Review dialog, then
    // the confirm button says Replace (nothing is sent before Confirm).
    await card.click({ button: 'right' })
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Replace image…' }).click()
    await (await chooser).setFiles([
      { name: 'replacement.jpg', mimeType: 'image/jpeg', buffer: await jpegBytes('#3b82f6') },
    ])

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: `Replace "${name}"` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Replace', exact: true }).click()

    await expect(page.getByText(new RegExp(`${name} replaced with v2`))).toBeVisible({ timeout: 30_000 })

    // The card's thumbnail is the new version, so the grid visibly changed.
    await expect.poll(async () => (await card.locator('img').getAttribute('src')) ?? '', { timeout: 15_000 })
      .not.toBe(v1Thumb)
    const v2Thumb = (await card.locator('img').getAttribute('src'))!
    expect(v2Thumb).toContain('.v2.thumb.webp')

    // Old and new pinned links each serve their own bytes.
    const v2Url = new URL(v2Thumb.replace('.thumb.webp', '.webp'), page.url()).toString()
    const v2Bytes = await (await page.request.get(v2Url)).body()
    expect(v2Bytes.equals(v1Bytes)).toBe(false)
    const oldAgain = await (await page.request.get(v1Url)).body()
    expect(oldAgain.equals(v1Bytes)).toBe(true)

    // The lightbox shows the new version and its Info panel agrees.
    await card.dblclick()
    const lightbox = page.getByRole('dialog', { name: `Lightbox: ${name}` })
    await lightbox.getByRole('button', { name: 'Show info' }).click()
    const versions = lightbox.locator('section').filter({ hasText: 'Versions' })
    await expect(versions.getByText('v2', { exact: true })).toBeVisible()
  })
})