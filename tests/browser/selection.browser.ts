// Hand-written spec for task 2.3 (selection and bulk bar), the task's Manual
// check: click / Ctrl / Shift build up "3 selected", Esc clears, Ctrl+A takes
// the folder, and changing folders clears the selection. Driven end to end
// because the agent session has no interactive browser tooling.
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

/** Rows and folders persist on the local database between runs, so every name
 *  carries a unique suffix. */
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

function selectionBar(page: Page) {
  return page.getByRole('toolbar', { name: 'Selection' })
}

test.describe('selection', () => {
  test.use({ storageState: AUTH_FILE })

  test('click, Ctrl, Shift and Ctrl+A select; Esc and a folder change clear', async ({ page }) => {
    const folderName = `Selection ${Date.now()}`
    await page.goto('/files')
    await createFolder(page, folderName)

    // A fresh folder keeps the expected count exact (no leftovers).
    await page.getByRole('link', { name: folderName }).first().click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)

    const names = ['aaa-sel', 'bbb-sel', 'ccc-sel'].map((prefix) => unique(prefix, '.jpg'))
    const backgrounds = ['#ef4444', '#22c55e', '#3b82f6']
    const files: BrowserFile[] = await Promise.all(
      names.map(async (name, index) => ({
        name,
        mimeType: 'image/jpeg',
        buffer: await jpegBytes(backgrounds[index]!),
      })),
    )
    await reviewAndUpload(page, files)
    for (const name of names) {
      await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })
    }

    // No selection yet: no bar.
    await expect(selectionBar(page)).toHaveCount(0)

    // Plain click selects one; the bar carries the count.
    await imageCard(page, names[0]!).click()
    await expect(selectionBar(page)).toContainText('1 selected')

    // Ctrl+click adds the second (the anchor).
    await imageCard(page, names[1]!).click({ modifiers: ['ControlOrMeta'] })
    await expect(selectionBar(page)).toContainText('2 selected')

    // Shift+click extends the range from the anchor: 3 selected.
    await imageCard(page, names[2]!).click({ modifiers: ['Shift'] })
    await expect(selectionBar(page)).toContainText('3 selected')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/selection-bar.png`, fullPage: true })

    // Esc clears selection and the bar goes away.
    await page.keyboard.press('Escape')
    await expect(selectionBar(page)).toHaveCount(0)

    // Ctrl/Cmd+A takes the whole folder — exactly these 3 images.
    await page.keyboard.press('ControlOrMeta+a')
    await expect(selectionBar(page)).toContainText('3 selected')

    // The AC: changing folders clears the selection.
    await page.getByRole('navigation', { name: 'Folder path' }).getByText('My Files').click()
    await expect(page).toHaveURL(/\/files$/u)
    await expect(selectionBar(page)).toHaveCount(0)
  })

  test('the list view selects a row and the bar clears it', async ({ page }) => {
    const name = unique('list-sel', '.jpg')
    await page.goto('/files')
    await reviewAndUpload(page, [
      { name, mimeType: 'image/jpeg', buffer: await jpegBytes('#8b5cf6') },
    ])
    await expect(page.locator(`img[alt="${name}"]`)).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'List view' }).click()
    const row = page.locator('tbody tr', { has: page.locator(`img[alt="${name}"]`) })
    await row.click()
    await expect(selectionBar(page)).toContainText('1 selected')

    // The ✕ action empties the selection.
    await selectionBar(page).getByRole('button', { name: 'Clear selection' }).click()
    await expect(selectionBar(page)).toHaveCount(0)
  })
})
