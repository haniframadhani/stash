// Hand-written spec for the upload flow (TASKS 1.4's cookie-free check, now
// through the Review & convert dialog of 1.6): New → Upload images → dialog →
// Confirm → queue → thumbnail in the grid → the thumb URL loads in a
// cookie-free context (the "private window" check). `guren browser:map`
// rewrites generated/, never this.
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, initialComponent, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 400, channels: 3, background: '#3b82f6' } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

test.describe('upload', () => {
  test.use({ storageState: AUTH_FILE })

  test('a JPEG lands in the grid and its thumb URL loads without cookies', async ({ page }) => {
    await page.goto('/files')
    expect(await initialComponent(page)).toBe('drive/Index')

    // Unique per run: uploads persist on the local database between runs.
    const fileName = `blue-square-${Date.now()}.jpg`
    const file: BrowserFile = { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes() }
    await reviewAndUpload(page, [file])
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-grid.png`, fullPage: true })

    // The partial reload brings the image into the grid.
    const thumb = page.locator(`img[alt="${fileName}"]`)
    await expect(thumb).toBeVisible()
    await expect(page.getByText(fileName, { exact: true })).toBeVisible()
    const thumbUrl = await thumb.getAttribute('src')
    expect(thumbUrl).toContain('/t/')

    // The private-window check: the permanent thumb URL serves without any
    // session, as `image/webp`.
    const cookieFree = await page.context().browser()!.newContext()
    const response = await cookieFree.request.get(thumbUrl!)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
    expect((await response.body()).length).toBeGreaterThan(0)
    await cookieFree.close()
  })

  test('a non-image is flagged in the dialog and never sent', async ({ page }) => {
    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/uploads')) uploads.push(request.url())
    })

    await page.goto('/files')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    await (await chooser).setFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not an image'),
    })

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Not an image the converter accepts (JPEG, PNG, WebP, AVIF or GIF).')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Upload 0', exact: true })).toBeDisabled()
    // Nothing was sent; the owner backs out with Cancel.
    expect(uploads).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-flagged.png`, fullPage: true })
  })
})
