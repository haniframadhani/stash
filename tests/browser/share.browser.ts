// Hand-written spec for tasks 3.3 and 6.3 (Share dialog). The app is local and
// stops answering when it is closed, so a link may only point at the bucket's
// public domain. Without PUBLIC_FILES_BASE_URL the dialog must offer nothing
// rather than hand out preview URLs that die with the app; the bucket-mode
// links are covered by tests/Share.test.ts and tests/UrlBuilder.test.ts.
// `guren browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(background = '#f59e0b'): Promise<Buffer> {
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

test.describe('share dialog', () => {
  test.use({ storageState: AUTH_FILE })

  test('offers no link when no public files domain is configured', async ({ page }) => {
    const name = uniqueName('share-me')
    const file: BrowserFile = { name, mimeType: 'image/jpeg', buffer: await jpegBytes() }

    await page.goto('/files')
    await reviewAndUpload(page, [file])
    await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })

    // Lightbox path: double-click the card, then the top-bar Share button.
    await imageCard(page, name).dblclick()
    const lightbox = page.getByRole('dialog', { name: `Lightbox: ${name}` })
    await expect(lightbox).toBeVisible()
    await lightbox.getByRole('button', { name: 'Share', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: `Share ${name}` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Share links come from the bucket, not this app.')).toBeVisible()

    // Nothing copyable: preview URLs die with the app, so the dialog explains
    // what to set instead of handing them out.
    await expect(dialog.getByText(/Sharing is off/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Copy / })).toHaveCount(0)
    // The only <code> left is the env name inside that note; no snippet box.
    await expect(dialog.locator('code').getByText('PUBLIC_FILES_BASE_URL')).toBeVisible()
    await expect(dialog.getByRole('tablist', { name: 'Embed format' })).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/share-dialog.png`, fullPage: true })

    await dialog.getByRole('button', { name: 'Close share dialog' }).click()
    await expect(dialog).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)

    // Context menu path opens the same dialog.
    await imageCard(page, name).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('dialog', { name: `Share ${name}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: `Share ${name}` })).toHaveCount(0)
  })
})
