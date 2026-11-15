// Hand-written spec for folder navigation (TASKS 2.1) — the task's Manual
// check, driven end to end because the agent session has no interactive
// browser tooling: New → New folder "Trips" → click into it → upload an image
// there → breadcrumb back to My Files → refresh inside the folder. `guren
// browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { AUTH_FILE, reviewAndUpload, type BrowserFile } from './support'

/** Screenshot home when the run is a `browser:record` run. */
const SHOTS = process.env.GUREN_BROWSER_RUN
  ? `.guren/browser/${process.env.GUREN_BROWSER_RUN}/screenshots`
  : undefined

async function jpegBytes(): Promise<Buffer> {
  return sharp({ create: { width: 480, height: 320, channels: 3, background: '#f59e0b' } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Folder rows persist on the local database between runs, so the name carries
 *  a unique suffix; the AC's "Trips" stays the prefix. */
function uniqueFolderName(): string {
  return `Trips ${Date.now()}`
}

async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  // The server redirects back to the current folder; the card lands on the
  // refreshed page.
  await expect(page.getByRole('link', { name: name }).first()).toBeVisible({ timeout: 15_000 })
}

async function openFolder(page: Page, name: string): Promise<number> {
  await page.getByRole('link', { name }).first().click()
  await expect(page).toHaveURL(/\/files\/\d+$/u)
  await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(name)).toBeVisible()
  const url = new URL(page.url()).pathname
  return Number(url.split('/')[2])
}

test.describe('folders', () => {
  test.use({ storageState: AUTH_FILE })

  test('New folder, navigation, upload inside, breadcrumbs back, deep link', async ({ page }) => {
    const name = uniqueFolderName()
    await page.goto('/files')

    // New → New folder "Trips" → the card appears above the images.
    await createFolder(page, name)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-created.png`, fullPage: true })

    // Click into it: URL and breadcrumbs follow.
    const folderId = await openFolder(page, name)
    const crumbs = page.getByRole('navigation', { name: 'Folder path' })
    await expect(crumbs.getByText('My Files')).toBeVisible()
    await expect(crumbs.getByText(name)).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-open.png`, fullPage: true })

    // Upload an image there: the queue lands it in this folder's grid.
    const fileName = `inside-${folderId}-${Date.now()}.jpg`
    const file: BrowserFile = { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes() }
    await reviewAndUpload(page, [file])
    await expect(page.locator(`img[alt="${fileName}"]`)).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-upload.png`, fullPage: true })

    // Breadcrumb back to My Files.
    await crumbs.getByText('My Files').click()
    await expect(page).toHaveURL(/\/files$/u)
    await expect(page.getByRole('link', { name: name }).first()).toBeVisible()

    // Refresh inside the folder: the deep link renders it again, image included.
    await page.goto(`/files/${folderId}`)
    await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(name)).toBeVisible()
    await expect(page.locator(`img[alt="${fileName}"]`)).toBeVisible()
  })

  test('an unknown folder id is a 404 page', async ({ page }) => {
    const response = await page.goto('/files/999999')
    expect(response?.status()).toBe(404)
  })

  test('an empty folder name is refused inline', async ({ page }) => {
    await page.goto('/files')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New folder' }).click()
    const dialog = page.getByRole('dialog', { name: 'New folder' })
    // Create stays disabled until there is a name; whitespace-only too.
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    await dialog.getByLabel('Name').fill('   ')
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  })
})
