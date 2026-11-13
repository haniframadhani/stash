import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'

// The drive shell routes (TASKS 1.2): `/` funnels into `/files`, which is
// protected; the sidebar's other pages render their own empty states.
describe('drive routes', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('sends a guest from /files to the sign-in page', async () => {
    await http.get('/files').assertRedirect('/login')
  })

  it('answers /dashboard with a 404: /files is the only path', async () => {
    await http.get('/dashboard').assertNotFound()
  })

  it('sends the app root into the drive', async () => {
    await http.get('/').assertRedirect('/files')
  })

  it('shows the drive shell to the signed-in owner', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

    const response = await http
      .json()
      .actingAs(owner)
      .get('/files')
      .assertInertia('drive/Index', {
        folder: null,
        breadcrumbs: [],
        folders: [],
        images: [],
      })
    response.assertOk()
    expect(owner.passwordHash.startsWith('$scrypt$')).toBe(true)
  })

  it('shares the stash props on the drive page', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

    const response = await http.json().actingAs(owner).get('/files')
    const page = await response.json<{ props: Record<string, unknown> }>()
    const props = page.props as {
      auth?: { user?: { id: number } | null }
      capabilities?: { webp?: boolean, avif?: boolean, maxUploadMb?: number }
      storage?: { usedBytes?: number, imageCount?: number }
      publicBaseUrl?: string
      flash?: Record<string, unknown>
    }
    expect(props.auth?.user?.id).toBe(owner.id)
    expect(typeof props.capabilities?.webp).toBe('boolean')
    expect(props.capabilities?.maxUploadMb).toBeGreaterThan(0)
    expect(props.storage).toEqual({ usedBytes: 0, imageCount: 0 })
    expect(typeof props.publicBaseUrl).toBe('string')
    expect(props.flash).toEqual({})
  })

  it('renders the sidebar pages with their empty states', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

    await http.json().actingAs(owner).get('/recent').assertInertia('drive/Recent', { images: [] })
    await http.json().actingAs(owner).get('/starred').assertInertia('drive/Starred', { folders: [], images: [] })
    await http.json().actingAs(owner).get('/trash').assertInertia('drive/Trash', { folders: [], images: [] })
  })
})
