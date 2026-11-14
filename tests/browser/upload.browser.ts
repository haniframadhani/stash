// Hand-written spec for the minimal upload flow (TASKS 1.4): New → Upload
// images → picker → toast with savings → thumbnail in the grid → the thumb URL
// loads in a cookie-free context (the "private window" check). `guren
// browser:map` rewrites generated/, never this.
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, initialComponent } from './support'

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

    // New opens the one-item menu; the item opens the file picker.
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    // Unique per run: uploads persist on the local database between runs.
    const fileName = `blue-square-${Date.now()}.jpg`
    const fileChooser = await chooser
    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: await jpegBytes(),
    })

    // The toast names the file and the savings (UI_SPEC §Toasts).
    await expect(page.getByText(new RegExp(`${fileName.replace('.', '\\.')}: .+ → .+ \\(−\\d+%\\)$`, 'u'))).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-toast.png`, fullPage: true })

    // The partial reload brings the image into the grid.
    const name = fileName
    const thumb = page.locator(`img[alt="${name}"]`)
    await expect(thumb).toBeVisible()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    const thumbUrl = await thumb.getAttribute('src')
    expect(thumbUrl).toContain('/t/')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-grid.png`, fullPage: true })

    // The private-window check: the permanent thumb URL serves without any
    // session, as `image/webp`.
    const cookieFree = await page.context().browser()!.newContext()
    const response = await cookieFree.request.get(thumbUrl!)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
    expect((await response.body()).length).toBeGreaterThan(0)
    await cookieFree.close()
  })

  test('a non-image shows the server message in an error toast', async ({ page }) => {
    await page.goto('/files')

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    const fileChooser = await chooser
    await fileChooser.setFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not an image'),
    })

    await expect(page.getByText(/note\.txt: Not an accepted image/u)).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-error.png`, fullPage: true })
  })
})
