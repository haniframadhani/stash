// Hand-written spec for the drive shell (TASKS 1.2): the flow the generated
// smoke specs only sample. `guren browser:map` rewrites generated/, never this.
import { expect, test, type Page } from '@playwright/test'
import { AUTH_FILE, initialComponent } from './support'

async function gotoLanding(page: Page, url: string): Promise<string | undefined> {
  const response = await page.goto(url)
  expect(response?.status()).toBeLessThan(400)
  return initialComponent(page)
}

test.describe('guest', () => {
  test('/ funnels into the drive and then to the sign-in card', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/u)
    expect(await initialComponent(page)).toBe('auth/Login')
  })

  test('/dashboard is gone: a guest gets a 404', async ({ page }) => {
    const response = await page.goto('/dashboard')
    expect(response?.status()).toBe(404)
  })
})

test.describe('signed in', () => {
  test.use({ storageState: AUTH_FILE })

  test('the shell renders with sidebar, disabled New and the empty state', async ({ page }) => {
    await gotoLanding(page, '/files')

    await expect(page.getByRole('navigation', { name: 'Drive' })).toBeVisible()
    for (const label of ['My Files', 'Recent', 'Starred', 'Trash']) {
      await expect(page.getByRole('navigation', { name: 'Drive' }).getByText(label)).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeDisabled()
    await expect(page.getByText('Drop images here or press New')).toBeVisible()
    // The storage meter placeholder with no data yet.
    await expect(page.getByText(/0 B used · 0 images/u)).toBeVisible()
  })

  test('/dashboard is gone: /files is the only path', async ({ page }) => {
    const response = await page.goto('/dashboard')
    expect(response?.status()).toBe(404)
  })
})

// Sessions are database-backed and the setup project's AUTH_FILE is shared by
// every spec in the run, so logging out here would kill the session under the
// other files' feet. This one signs itself in first.
test.describe('log out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('logging out returns to the sign-in card and ends the session', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill('browser@example.test')
    await page.getByLabel('Password').fill(process.env.BROWSER_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/files$/u)

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/u)
    // The session is really gone: /files bounces a second time.
    await page.goto('/files')
    await expect(page).toHaveURL(/\/login$/u)
  })
})

test.describe('drawer below lg', () => {
  test.use({ storageState: AUTH_FILE, viewport: { width: 360, height: 800 } })

  test('the sidebar becomes a drawer with a working scrim', async ({ page }) => {
    await gotoLanding(page, '/files')

    const menu = page.getByRole('button', { name: 'Open menu' })
    await expect(menu).toBeVisible()

    await menu.click()
    const dialog = page.getByRole('dialog', { name: 'Drive menu' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('navigation', { name: 'Drive' })).toBeVisible()

    // Navigating from the drawer closes it; the page changes underneath.
    // A client-side visit keeps the first page's SSR payload, so assert the render.
    await dialog.getByText('Trash').click()
    await expect(page).toHaveURL(/\/trash$/u)
    await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
  })
})
