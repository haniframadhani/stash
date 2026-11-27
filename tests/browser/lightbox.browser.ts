// Hand-written spec for task 2.5 (context menu and lightbox), the task's Manual
// check: right-click offers only the built actions, double-click opens the
// lightbox, arrow keys move across the folder's images, Esc closes.
// `guren browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(background: string): Promise<Buffer> {
  return sharp({ create: { width: 480, height: 320, channels: 3, background } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

function unique(prefix: string, extension = ''): string {
  return `${prefix}-${Date.now()}${extension}`
}

async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('link', { name: name }).first()).toBeVisible({ timeout: 15_000 })
}

function imageCard(page: Page, name: string) {
  return page.locator('main li').filter({ has: page.locator(`img[alt="${name}"]`) })
}

test.describe('context menu and lightbox', () => {
  test.use({ storageState: AUTH_FILE })

  test('right-click lists only the built actions; double-click opens; arrows move; Esc closes', async ({ page }) => {
    const folderName = `Lightbox ${Date.now()}`
    await page.goto('/files')
    await createFolder(page, folderName)
    await page.getByRole('link', { name: folderName }).first().click()

    const names = ['aaa-lb', 'bbb-lb', 'ccc-lb'].map((prefix) => unique(prefix, '.jpg'))
    const files: BrowserFile[] = await Promise.all(
      names.map(async (name, index) => ({
        name,
        mimeType: 'image/jpeg',
        buffer: await jpegBytes(['#ef4444', '#22c55e', '#3b82f6'][index]!),
      })),
    )
    await reviewAndUpload(page, files)
    for (const name of names) {
      await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })
    }

    // Right-click selects an unselected image and opens the shared menu.
    await imageCard(page, names[0]!).click({ button: 'right' })
    const menu = page.getByRole('menu', { name: `Actions for ${names[0]}` })
    await expect(menu.getByRole('menuitem', { name: 'Open' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Download' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Move to…' })).toBeVisible()
    // Share (3.3), Replace (3.1) and Move to trash (4.2) shipped; Star is still hidden.
    await expect(menu.getByRole('menuitem', { name: 'Share' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Replace image…' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Star' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Move to trash' })).toBeVisible()

    // Open from the menu lands in the lightbox with the id in the URL.
    await menu.getByRole('menuitem', { name: 'Open' }).click()
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[0]}` })).toBeVisible()
    const lightbox = page.getByRole('dialog', { name: /Lightbox/ })
    await expect(page).toHaveURL(/[?&]image=\d+/u)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/lightbox.png` })

    // The AC: arrow keys walk the current folder's images in order.
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[1]}` })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[2]}` })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[2]}` })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[1]}` })).toBeVisible()

    // Info panel: facts and the versions list (task 3.2).
    await lightbox.getByRole('button', { name: 'Show info' }).click()
    await expect(lightbox.getByText('Dimensions')).toBeVisible()
    const versions = lightbox.locator('section').filter({ hasText: 'Versions' })
    await expect(versions.getByText('v1', { exact: true })).toBeVisible()
    await expect(versions.getByText('Current', { exact: true })).toBeVisible()

    // Esc closes and drops the URL param.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Lightbox/ })).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]image=/u)
  })

  // Task 6.2: the info panel keeps the lightbox and the page responsive.
  test('the info panel leaves the lightbox and the page responsive', async ({ page }) => {
    const folderName = `Info ${Date.now()}`
    await page.goto('/files')
    await createFolder(page, folderName)
    await page.getByRole('link', { name: folderName }).first().click()

    const names = ['info-a', 'info-b', 'info-c'].map((prefix) => unique(prefix, '.jpg'))
    const files: BrowserFile[] = await Promise.all(
      names.map(async (name, index) => ({
        name,
        mimeType: 'image/jpeg',
        buffer: await jpegBytes(['#f97316', '#06b6d4', '#a855f7'][index]!),
      })),
    )
    await reviewAndUpload(page, files)
    for (const name of names) {
      await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })
    }

    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    // A blocked main thread makes this hang; a swallowed click leaves the
    // panel open. Both are the freeze the bug reports (6.2).
    const responsive = async (label: string) => {
      const started = Date.now()
      await page.waitForFunction(() => true, null, { timeout: 5_000 })
      expect(Date.now() - started, `main thread blocked at ${label}`).toBeLessThan(1_000)
    }

    await page.locator('main li').filter({ has: page.locator(`img[alt="${names[0]}"]`) }).dblclick()
    const lightbox = page.getByRole('dialog', { name: /Lightbox: / })
    await expect(lightbox).toBeVisible()

    await lightbox.getByRole('button', { name: 'Show info' }).click()
    await expect(lightbox.getByText('Dimensions')).toBeVisible()
    await responsive('info opened')

    // Arrows keep working with Info open, across the whole folder.
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[1]}` })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[0]}` })).toBeVisible()
    await responsive('navigated with info open')

    // The last image has no next; the panel still closes.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[2]}` })).toBeVisible()
    await lightbox.getByRole('button', { name: 'Hide info' }).click()
    await expect(lightbox.getByText('Dimensions')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Lightbox/ })).toHaveCount(0)

    // The drive takes clicks again.
    await page.locator('main li').filter({ has: page.locator(`img[alt="${names[1]}"]`) }).dblclick()
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[1]}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Lightbox/ })).toHaveCount(0)

    // List view: the same panel and keys.
    await page.getByRole('button', { name: 'List view' }).click()
    await page.locator('main tr').filter({ hasText: names[0] }).dblclick()
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[0]}` })).toBeVisible()
    await page.getByRole('button', { name: 'Show info' }).click()
    await expect(lightbox.getByText('Dimensions', { exact: true })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: `Lightbox: ${names[1]}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Lightbox/ })).toHaveCount(0)
    await responsive('list view afterwards')
    expect(errors).toEqual([])
  })
})
