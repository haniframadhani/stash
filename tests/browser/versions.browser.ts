// Hand-written spec for task 3.2 (Versions panel and restore), its Manual
// check: open Info on an image with two versions, Make current on v1, and the
// lightbox shows v1 while v2's pinned link still serves its own bytes. The
// browser suite has no files domain, so the "permanent" link here is the
// private preview; bucket URLs are covered by tests/controllers/ImageController
// .test.ts. `guren browser:map` rewrites generated/, never this.
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

test.describe('versions panel', () => {
  test.use({ storageState: AUTH_FILE })

  test('lists versions, makes an older one current, and keeps both pinned links', async ({ page }) => {
    const name = uniqueName('versions')
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
    const v1Url = new URL(v1View, page.url()).toString()
    const v1Bytes = await (await page.request.get(v1Url)).body()

    // Replace once so the panel has two versions to choose from.
    await card.click({ button: 'right' })
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Replace image…' }).click()
    await (await chooser).setFiles([
      { name: 'replacement.jpg', mimeType: 'image/jpeg', buffer: await jpegBytes('#3b82f6') },
    ])
    let v2View = ''
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST' || !/\/images\/\d+\/versions$/u.test(new URL(response.url()).pathname) || response.status() !== 201) return
      const body = await response.json() as { image: { urls: { view: string } } }
      v2View = body.image.urls.view
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Replace', exact: true }).click()
    await expect(page.getByText(new RegExp(`${name} replaced with v2`))).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => v2View).toContain('.v2.webp')
    const v2Url = new URL(v2View, page.url()).toString()
    const v2Bytes = await (await page.request.get(v2Url)).body()

    // Info lists newest first, marks v2 current, and offers both actions.
    await card.dblclick()
    const lightbox = page.getByRole('dialog', { name: `Lightbox: ${name}` })
    await expect(lightbox).toBeVisible()
    await lightbox.getByRole('button', { name: 'Show info' }).click()
    const versions = lightbox.locator('section').filter({ hasText: 'Versions' })
    await expect(versions.getByText('v2', { exact: true })).toBeVisible()
    await expect(versions.getByText('v1', { exact: true })).toBeVisible()
    await expect(versions.getByText('Current', { exact: true })).toHaveCount(1)
    await expect(versions.getByRole('link', { name: 'Open v1' })).toHaveAttribute('href', new URL(v1Url).pathname)
    // No files domain in this suite: there is no permanent link to copy.
    await expect(versions.getByRole('button', { name: /^Copy link to v/ })).toHaveCount(0)

    // Make current on v1: the pointer moves, the lightbox stays open on v1.
    await versions.getByRole('button', { name: 'Make v1 current' }).click()
    await expect(lightbox).toBeVisible()
    await expect(lightbox.locator('img')).toHaveAttribute('src', new URL(v1Url).pathname, { timeout: 15_000 })
    await expect(versions.getByText('Current', { exact: true })).toHaveCount(1)
    await expect(versions.getByRole('button', { name: 'Make v2 current' })).toBeVisible()

    // Both pinned versions still serve their own bytes.
    expect((await (await page.request.get(v1Url)).body()).equals(v1Bytes)).toBe(true)
    expect((await (await page.request.get(v2Url)).body()).equals(v2Bytes)).toBe(true)

    // Make v2 current again to leave the image as it was.
    await versions.getByRole('button', { name: 'Make v2 current' }).click()
    await expect(lightbox.locator('img')).toHaveAttribute('src', new URL(v2Url).pathname, { timeout: 15_000 })
  })
})