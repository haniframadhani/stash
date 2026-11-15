// Hand-written spec for the Review & convert dialog and upload queue (TASKS
// 1.6, UI_SPEC §3 and §4): 20 dropped files (an SVG and a 60 MB JPEG among
// them) review to 18 valid rows and 2 flagged; nothing is sent before Confirm;
// row overrides, the queue panel with progress and savings, cancel and retry,
// and the remembered settings. `guren browser:map` rewrites generated/, never
// this.
import { expect, test, type JSHandle, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload } from './support'

const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

test.use({ storageState: AUTH_FILE })

interface Fixtures {
  jpeg: string
  png: string
  svg: string
}

async function fixtures(): Promise<Fixtures> {
  const jpeg = await sharp({ create: { width: 240, height: 160, channels: 3, background: '#3b82f6' } })
    .jpeg({ quality: 85 })
    .toBuffer()
  const png = await sharp({ create: { width: 240, height: 160, channels: 3, background: '#f59e0b' } })
    .png()
    .toBuffer()
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
  return { jpeg: jpeg.toString('base64'), png: png.toString('base64'), svg: svg.toString('base64') }
}

/** A DataTransfer with 20 files: 17 JPEGs, 1 PNG (18 valid), 1 SVG and a 60 MB
 *  JPEG (2 flagged). Built in the page, because the drop path is the one the
 *  owner's manual check names. */
async function twentyFileTransfer(page: Page, fixture: Fixtures) {
  return page.evaluateHandle(({ jpeg, png, svg }) => {
    const decode = (b64: string) => Uint8Array.from(atob(b64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    for (let index = 1; index <= 17; index++) {
      transfer.items.add(new File([decode(jpeg)], `photo-${String(index).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
    }
    transfer.items.add(new File([decode(png)], 'scan.png', { type: 'image/png' }))
    transfer.items.add(new File([decode(svg)], 'logo.svg', { type: 'image/svg+xml' }))
    // The oversized one: real JPEG head, zero padding to 60 MB.
    const huge = new Uint8Array(60 * 1024 * 1024)
    huge.set(decode(jpeg), 0)
    transfer.items.add(new File([huge], 'huge-photo.jpg', { type: 'image/jpeg' }))
    return transfer
  }, fixture)
}

/** Dispatches a drag event from inside the page: a native `DragEvent` with the
 *  transfer reaches the shell's window listeners, which Playwright's
 *  `dispatchEvent` synthetic event does not. The handle must be a top-level
 *  argument — Playwright passes JSHandles only there. */
async function dispatchDrag(page: Page, type: 'dragenter' | 'drop', transfer: JSHandle) {
  if (type === 'dragenter') {
    await page.evaluate((dataTransfer) => {
      document.body.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dataTransfer as DataTransfer }))
    }, transfer)
  } else {
    await page.evaluate((dataTransfer) => {
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dataTransfer as DataTransfer }))
    }, transfer)
  }
}

test.describe('review & convert', () => {
  test('20 dropped files review to 18 valid rows, 2 flagged, and nothing is sent before Confirm', async ({ page }) => {
    await page.goto('/files')

    // The network log: the AC's "nothing is sent before Confirm" witness.
    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/uploads')) uploads.push(request.url())
    })

    const dataTransfer = await twentyFileTransfer(page, await fixtures())
    // The dispatch is one-shot, and `goto` does not guarantee React has
    // attached the window drag listeners yet — re-dispatch until the overlay
    // answers (repeats only deepen the counter, which drop resets).
    await expect(async () => {
      await dispatchDrag(page, 'dragenter', dataTransfer)
      await expect(page.getByText(/Drop images to upload to/u)).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/drop-overlay.png`, fullPage: true })
    await dispatchDrag(page, 'drop', dataTransfer)

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Upload 18 images to "My Files"' })).toBeVisible()
    await expect(dialog.getByText('SVG is not accepted (scripts can hide in it).')).toBeVisible()
    await expect(dialog.getByText('Larger than the 50 MB limit.')).toBeVisible()
    await expect(dialog.getByText('2 of 20 files are excluded from this upload.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Upload 18', exact: true })).toBeEnabled()
    // Previews are client-only; the network log proves nothing was sent.
    expect(uploads).toHaveLength(0)

    // Row overrides: one AVIF, one Original (with its metadata warning).
    await dialog.locator('li', { hasText: 'photo-01.jpg' }).getByLabel('Format for photo-01.jpg').selectOption('avif')
    await dialog.locator('li', { hasText: 'photo-02.jpg' }).getByLabel('Format for photo-02.jpg').selectOption('original')
    await expect(dialog.getByText('Original keeps metadata (including GPS) and stores the file exactly as uploaded.')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/review-dialog.png`, fullPage: true })

    await dialog.getByRole('button', { name: 'Upload 18', exact: true }).click()
    await expect(dialog).toBeHidden()
    const queue = page.getByRole('region', { name: 'Upload queue' })
    await expect(queue).toBeVisible()
    await expect(page.getByText('18 uploads complete', { exact: true })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/→ .+ \(−\d+%\)/u).first()).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-queue.png`, fullPage: true })

    // The grid followed the partial reloads.
    await expect(page.locator('img[alt="photo-03.jpg"]')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(queue).toBeHidden()
  })

  test('a confirmed choice is remembered for the next dialog', async ({ page }) => {
    await page.goto('/files')

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    await (await chooser).setFiles({
      name: `remembered-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#10b981' } }).jpeg().toBuffer(),
    })

    const dialog = page.getByRole('dialog')
    // "Remember" is off until a choice was saved; opt in, then confirm.
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('radio', { name: 'Original' }).check()
    await expect(dialog.getByText(/Original keeps metadata/u)).toBeVisible()
    await dialog.getByRole('button', { name: 'Upload 1', exact: true }).click()
    await expect(page.getByText('1 upload complete', { exact: true })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Clear', exact: true }).click()

    // Reopening shows the remembered format; "Remember" stays checked.
    const chooserAgain = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    await (await chooserAgain).setFiles({
      name: `remembered-again-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#ef4444' } }).jpeg().toBuffer(),
    })
    await expect(dialog.getByRole('radio', { name: 'Original' })).toBeChecked()
    await expect(dialog.getByRole('checkbox')).toBeChecked()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  })

  test('an upload that never answers can be canceled', async ({ page }) => {
    // Never respond: the request hangs at progress 0 until the row is canceled.
    await page.route('**/uploads', () => {})
    await page.goto('/files')

    const fileName = `canceled-${Date.now()}.jpg`
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    await (await chooser).setFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#8b5cf6' } }).jpeg().toBuffer(),
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Upload 1', exact: true }).click()

    await expect(page.getByRole('region', { name: 'Upload queue' })).toBeVisible()
    await page.getByRole('button', { name: `Cancel ${fileName}` }).click()
    await expect(page.getByText('Canceled', { exact: true })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-canceled.png`, fullPage: true })
  })

  test('a failed upload offers Retry and lands on the second attempt', async ({ page }) => {
    let broken = true
    await page.route('**/uploads', async (route) => {
      if (broken) {
        broken = false
        await route.abort('failed')
        return
      }
      await route.continue()
    })
    await page.goto('/files')

    const fileName = `retry-${Date.now()}.jpg`
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Upload images' }).click()
    await (await chooser).setFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#0ea5e9' } }).jpeg().toBuffer(),
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Upload 1', exact: true }).click()

    await expect(page.getByText('The upload could not reach the server.')).toBeVisible()
    await page.getByRole('button', { name: `Retry ${fileName}` }).click()
    await expect(page.getByText('1 upload complete', { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('img[alt="' + fileName + '"]')).toBeVisible({ timeout: 30_000 })
  })

  test('the picker path reviews the same way (helper sanity for other specs)', async ({ page }) => {
    await page.goto('/files')
    await reviewAndUpload(page, [
      { name: `helper-${Date.now()}.jpg`, mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 100, height: 100, channels: 3, background: '#eab308' } }).jpeg().toBuffer() },
    ])
    await expect(page.locator('img[alt^="helper-"]').first()).toBeVisible()
  })
})
