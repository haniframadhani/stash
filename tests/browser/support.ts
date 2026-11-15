import { expect, type Page } from '@playwright/test'

/** Written by the setup project and git-ignored: it holds a session cookie. */
export const AUTH_FILE = 'tests/browser/.auth/user.json'

/** The account db/seeders/browser-account.ts writes while `guren browser:serve` runs the app. */
export const BROWSER_ACCOUNT_EMAIL = 'browser@example.test'

/** A file to stage in the Review dialog (TASKS 1.6). */
export interface BrowserFile {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * New → Upload images → Review & convert dialog → Confirm, then waits until
 * the queue panel reports every upload complete and clears itself. Nothing is
 * sent before Confirm, so a caller can observe the dialog first by passing its
 * own steps — this is the whole flow for tests that just need images stored.
 */
export async function reviewAndUpload(page: Page, files: BrowserFile[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Upload images' }).click()
  await (await chooser).setFiles(files)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: `Upload ${files.length}`, exact: true }).click()
  const complete = `${files.length} ${files.length === 1 ? 'upload' : 'uploads'} complete`
  await expect(page.getByText(complete, { exact: true })).toBeVisible({ timeout: 60_000 })
  // Drop the panel so a later batch in the same test starts clean.
  const clear = page.getByRole('button', { name: 'Clear', exact: true })
  if (await clear.isVisible().catch(() => false)) await clear.click()
}

/** Loaded from the app's env files by playwright.browser.config.ts, as the seeder reads it. */
export function browserTestPassword(): string {
  const password = process.env.BROWSER_TEST_PASSWORD
  if (!password) throw new Error('Set BROWSER_TEST_PASSWORD in .env: the browser account is seeded with it, and nothing signs in without it.')
  return password
}

/**
 * The component the server rendered: Guren's page shell sets `window.__INERTIA_PAGE__` from the same
 * element `guren browser:doctor` reads, which is parsed here when a CSP without the shell's nonce kept
 * that inline script from running. Only a full load writes either: after a client-side visit they
 * still name the first page.
 */
export async function initialComponent(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    let initial = (window as Window & { __INERTIA_PAGE__?: { component?: unknown } }).__INERTIA_PAGE__
    if (!initial) {
      try {
        initial = JSON.parse(document.querySelector('script[data-page="app"][type="application/json"]')?.textContent ?? 'null')
      } catch {
        initial = undefined
      }
    }
    return typeof initial?.component === 'string' ? initial.component : undefined
  })
}
