// Hand-written spec for task 3.3 (Share dialog), the task's Manual check:
// the 🔗 in the lightbox and the context menu open the dialog, each Copy puts
// the link on the clipboard, and every copied URL opens in a cookie-free
// context (the "private window") and serves the expected version.
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

/** Grants clipboard read/write so the spec can assert what Copy wrote. */
async function allowClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
}

async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

test.describe('share dialog', () => {
  test.use({ storageState: AUTH_FILE })

  test('🔗 in the lightbox and context menu copies links that work logged out', async ({ page }) => {
    const name = uniqueName('share-me')
    const file: BrowserFile = { name, mimeType: 'image/jpeg', buffer: await jpegBytes() }

    await page.goto('/files')
    await allowClipboard(page)
    await reviewAndUpload(page, [file])
    await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })

    // Lightbox path: double-click the card, then the top-bar Share button.
    await imageCard(page, name).dblclick()
    const lightbox = page.getByRole('dialog', { name: `Lightbox: ${name}` })
    await expect(lightbox).toBeVisible()
    await lightbox.getByRole('button', { name: 'Share', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: `Share ${name}` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Anyone with the link can view. No login required.')).toBeVisible()

    const latestText = (await dialog.getByText(/\/i\/[^/]+\/.*$/u).first().textContent())!.trim()
    await dialog.getByRole('button', { name: 'Copy always latest link' }).click()
    await expect(page.getByText('Link copied', { exact: true })).toBeVisible()
    await expect.poll(() => clipboard(page)).toBe(latestText)

    await dialog.getByRole('button', { name: 'Copy this version link' }).click()
    const permanentText = (await dialog.getByText(/\.v\d+\.[a-z]+$/u).first().textContent())!.trim()
    await expect.poll(() => clipboard(page)).toBe(permanentText)
    expect(permanentText).toMatch(/\.v\d+\./u)

    // Embed snippets: Markdown by default, HTML on the second tab.
    expect(await dialog.getByRole('tab', { name: 'Markdown' }).getAttribute('aria-selected')).toBe('true')
    const snippet = dialog.locator('code')
    await expect(snippet).toContainText(`![${name}](`)
    await dialog.getByRole('button', { name: 'Copy embed snippet' }).click()
    await expect.poll(() => clipboard(page)).toContain(`![${name}](`)
    await dialog.getByRole('tab', { name: 'HTML' }).click()
    await expect(snippet).toContainText('<img src=')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/share-dialog.png`, fullPage: true })

    await dialog.getByRole('button', { name: 'Close share dialog' }).click()
    await expect(dialog).toHaveCount(0)

    // The AC: both links open with no session at all.
    const cookieFree = await page.context().browser()!.newContext()
    for (const url of [latestText, permanentText]) {
      const response = await cookieFree.request.get(url)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toBe('image/webp')
      expect((await response.body()).length).toBeGreaterThan(0)
    }
    await cookieFree.close()

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
