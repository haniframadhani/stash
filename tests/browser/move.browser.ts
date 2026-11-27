// Hand-written spec for task 2.4 (move), the task's Manual check plus the AC:
// drag an image onto a folder card and it leaves this folder and lands inside;
// the hide is optimistic (a held request shows the card gone before the
// response); dropping a folder onto itself rolls back with an error toast; a
// breadcrumb crumb and the sidebar's My Files are drop targets; the selection
// bar's Move opens the picker. Driven end to end because the agent session has
// no interactive browser tooling. `guren browser:map` rewrites generated/,
// never this.
import { expect, test, type Locator, type Page } from '@playwright/test'
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

/** Names persist on the local database between runs, so each carries a suffix. */
function unique(prefix: string, extension = ''): string {
  return `${prefix}-${Date.now()}${extension}`
}

async function createFolder(page: Page, name: string, inside?: number): Promise<void> {
  if (inside !== undefined) await page.goto(`/files/${inside}`)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('link', { name }).first()).toBeVisible({ timeout: 15_000 })
}

function folderCard(page: Page, name: string): Locator {
  return page.getByRole('link', { name }).first()
}

function imageCard(page: Page, name: string): Locator {
  return page.locator('main li').filter({ has: page.locator(`img[alt="${name}"]`) })
}

function selectionBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Selection' })
}

/**
 * HTML5 drag and drop as the browser fires it. Playwright's `dragTo` drives
 * mouse events, which Chromium only turns into a drag after a threshold; the
 * app's drop handlers read `event.dataTransfer`, so the synthetic events carry
 * a real `DataTransfer` and the same order (start → enter → over → drop → end).
 */
async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceHandle = await source.elementHandle()
  const targetHandle = await target.elementHandle()
  if (!sourceHandle || !targetHandle) throw new Error('drag source or target disappeared')
  await page.evaluate(
    ([from, to]) => {
      const dataTransfer = new DataTransfer()
      const init = { bubbles: true, cancelable: true, dataTransfer }
      from.dispatchEvent(new DragEvent('dragstart', init))
      to.dispatchEvent(new DragEvent('dragenter', init))
      to.dispatchEvent(new DragEvent('dragover', init))
      to.dispatchEvent(new DragEvent('drop', init))
      from.dispatchEvent(new DragEvent('dragend', init))
    },
    [sourceHandle, targetHandle] as const,
  )
}

test.describe('move', () => {
  test.use({ storageState: AUTH_FILE })

  test('drag an image onto a folder card: it leaves here and lands inside', async ({ page }) => {
    const folderName = unique('Move target')
    await page.goto('/files')
    await createFolder(page, folderName)

    const fileName = unique('move-me', '.jpg')
    await reviewAndUpload(page, [
      { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes('#ef4444') },
    ])
    const card = imageCard(page, fileName)
    await expect(card).toBeVisible({ timeout: 30_000 })

    await dragTo(page, card, folderCard(page, folderName))

    await expect(page.getByText('Moved 1 item')).toBeVisible({ timeout: 15_000 })
    await expect(card).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/move-after-drop.png`, fullPage: true })

    // The redirect lands back on the source folder; opening the target shows it.
    await expect(page).toHaveURL(/\/files$/u)
    await folderCard(page, folderName).click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)
    await expect(imageCard(page, fileName)).toBeVisible({ timeout: 15_000 })
  })

  test('an internal drag never opens the upload overlay', async ({ page }) => {
    const folderName = unique('Move quiet')
    await page.goto('/files')
    await createFolder(page, folderName)

    const fileName = unique('quiet-drag', '.jpg')
    await reviewAndUpload(page, [
      { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes('#0ea5e9') },
    ])
    const card = imageCard(page, fileName)
    await expect(card).toBeVisible({ timeout: 30_000 })

    // What Chromium sends for an in-drive card drag: our own type from
    // `startDrag`, plus `Files` because the source is an <img>. Neither the
    // window overlay nor the Review dialog may answer it (task 6.1).
    const types = await page.evaluate((source) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'drag.png', { type: 'image/png' }))
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer }
      source.dispatchEvent(new DragEvent('dragstart', init))
      document.body.dispatchEvent(new DragEvent('dragenter', init))
      document.body.dispatchEvent(new DragEvent('dragover', init))
      document.body.dispatchEvent(new DragEvent('drop', init))
      source.dispatchEvent(new DragEvent('dragend', init))
      return Array.from(transfer.types)
    }, await card.elementHandle().then((handle) => handle!))

    expect(types).toContain('Files')
    expect(types).toContain('application/x-stash-items')
    await expect(page.getByText(/Drop images to upload/u)).toBeHidden()
    await expect(page.getByRole('dialog')).toBeHidden()
    // The drop on empty page background did nothing, and the card is still here.
    await expect(card).toBeVisible()
    await expect(page.getByText(/Moved \d+ items?/u)).toBeHidden()
  })

  test('the picker moves items out of a folder back to My Files', async ({ page }) => {
    const folderName = unique('Move out')
    await page.goto('/files')
    await createFolder(page, folderName)
    await folderCard(page, folderName).click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)

    const names = [unique('out-a', '.jpg'), unique('out-b', '.jpg')]
    await reviewAndUpload(page, [
      { name: names[0]!, mimeType: 'image/jpeg', buffer: await jpegBytes('#f43f5e') },
      { name: names[1]!, mimeType: 'image/jpeg', buffer: await jpegBytes('#0d9488') },
    ])
    for (const name of names) {
      await expect(imageCard(page, name)).toBeVisible({ timeout: 30_000 })
    }

    await imageCard(page, names[0]!).click()
    await imageCard(page, names[1]!).click({ modifiers: ['ControlOrMeta'] })
    await expect(selectionBar(page)).toContainText('2 selected')
    await selectionBar(page).getByRole('button', { name: 'Move selected items', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Move items' })
    await dialog.locator('select').selectOption({ label: 'My Files' })
    // The root is a real destination, not just the "nothing chosen" state.
    await expect(dialog.getByRole('button', { name: 'Move', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Move', exact: true }).click()

    await expect(page.getByText('Moved 2 items')).toBeVisible({ timeout: 15_000 })
    for (const name of names) {
      await expect(imageCard(page, name)).toHaveCount(0)
    }

    // Back at the root both images are there, out of the folder.
    await page.getByRole('navigation', { name: 'Folder path' }).getByText('My Files').click()
    await expect(page).toHaveURL(/\/files$/u)
    for (const name of names) {
      await expect(imageCard(page, name)).toBeVisible({ timeout: 15_000 })
    }
  })

  test('the hide is optimistic: a held request shows the card gone first', async ({ page }) => {
    const folderName = unique('Move held')
    await page.goto('/files')
    await createFolder(page, folderName)

    const fileName = unique('move-held', '.jpg')
    await reviewAndUpload(page, [
      { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes('#22c55e') },
    ])
    const card = imageCard(page, fileName)
    await expect(card).toBeVisible({ timeout: 30_000 })

    // Hold the move request open; the card must disappear before it returns.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/items/move', async (route) => {
      await held
      await route.continue()
    })

    await dragTo(page, card, folderCard(page, folderName))
    await expect(card).toHaveCount(0)

    release()
    await expect(page.getByText('Moved 1 item')).toBeVisible({ timeout: 15_000 })
    await page.unroute('**/items/move')
  })

  test('dropping a folder onto itself rolls back with an error toast', async ({ page }) => {
    const folderName = unique('Move self')
    await page.goto('/files')
    await createFolder(page, folderName)

    const card = folderCard(page, folderName)
    await dragTo(page, card, card)

    await expect(page.getByRole('alert')).toContainText('CYCLE', { timeout: 15_000 })
    // Rollback: the folder is still here, and no move happened.
    await expect(card).toBeVisible()
    await expect(page).toHaveURL(/\/files$/u)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/move-cycle-error.png`, fullPage: true })
  })

  test('a breadcrumb crumb is a drop target (moves to that folder)', async ({ page }) => {
    const folderName = unique('Move crumb')
    await page.goto('/files')
    await createFolder(page, folderName)
    await folderCard(page, folderName).click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)

    const fileName = unique('move-crumb', '.jpg')
    await reviewAndUpload(page, [
      { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes('#3b82f6') },
    ])
    const card = imageCard(page, fileName)
    await expect(card).toBeVisible({ timeout: 30_000 })

    // Drop onto the "My Files" crumb: the image moves to the root.
    const crumbs = page.getByRole('navigation', { name: 'Folder path' })
    await dragTo(page, card, crumbs.getByText('My Files'))

    await expect(page.getByText('Moved 1 item')).toBeVisible({ timeout: 15_000 })
    await expect(card).toHaveCount(0)
    await crumbs.getByText('My Files').click()
    await expect(page).toHaveURL(/\/files$/u)
    await expect(imageCard(page, fileName)).toBeVisible({ timeout: 15_000 })
  })

  test("the sidebar's My Files is a drop target (moves to the root)", async ({ page }) => {
    const folderName = unique('Move sidebar')
    await page.goto('/files')
    await createFolder(page, folderName)
    await folderCard(page, folderName).click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)

    const fileName = unique('move-sidebar', '.jpg')
    await reviewAndUpload(page, [
      { name: fileName, mimeType: 'image/jpeg', buffer: await jpegBytes('#eab308') },
    ])
    const card = imageCard(page, fileName)
    await expect(card).toBeVisible({ timeout: 30_000 })

    await dragTo(page, card, page.getByRole('navigation', { name: 'Drive' }).getByRole('link', { name: 'My Files' }))

    await expect(page.getByText('Moved 1 item')).toBeVisible({ timeout: 15_000 })
    await expect(card).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Drive' }).getByRole('link', { name: 'My Files' }).click()
    await expect(page).toHaveURL(/\/files$/u)
    await expect(imageCard(page, fileName)).toBeVisible({ timeout: 15_000 })
  })

  test('the selection bar opens the picker and moves the selection', async ({ page }) => {
    const folderName = unique('Move picker')
    await page.goto('/files')
    await createFolder(page, folderName)

    const names = [unique('pick-a', '.jpg'), unique('pick-b', '.jpg')]
    const files: BrowserFile[] = await Promise.all(
      names.map(async (name, index) => ({
        name,
        mimeType: 'image/jpeg',
        buffer: await jpegBytes(index === 0 ? '#8b5cf6' : '#14b8a6'),
      })),
    )
    await reviewAndUpload(page, files)
    for (const name of names) {
      await expect(imageCard(page, name)).toBeVisible({ timeout: 30_000 })
    }

    await imageCard(page, names[0]!).click()
    await imageCard(page, names[1]!).click({ modifiers: ['ControlOrMeta'] })
    await expect(selectionBar(page)).toContainText('2 selected')

    await selectionBar(page).getByRole('button', { name: 'Move selected items', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Move items' })
    await expect(dialog).toBeVisible()
    // The current folder is a no-op, so it is not a selectable destination.
    await expect(dialog.locator('option', { hasText: 'My Files' })).toBeAttached()
    await dialog.locator('select').selectOption({ label: folderName })
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/move-picker.png`, fullPage: true })
    await dialog.getByRole('button', { name: 'Move', exact: true }).click()

    await expect(page.getByText('Moved 2 items')).toBeVisible({ timeout: 15_000 })
    for (const name of names) {
      await expect(imageCard(page, name)).toHaveCount(0)
    }

    await folderCard(page, folderName).click()
    await expect(page).toHaveURL(/\/files\/\d+$/u)
    for (const name of names) {
      await expect(imageCard(page, name)).toBeVisible({ timeout: 15_000 })
    }
  })
})
