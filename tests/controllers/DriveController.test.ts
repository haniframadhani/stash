import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'
import { Folder } from '../../app/Models/Folder.js'
import { Image } from '../../app/Models/Image.js'
import { ImageVersion } from '../../app/Models/ImageVersion.js'
import { newPublicId } from '../../app/Services/ImageStore.js'
import { toSlug } from '../../app/Services/Slug.js'

/** One active root image with a version-1 webp row, as an upload would leave
 *  it; the listing never touches storage, so the keys can be opaque. */
async function seedImage(name: string, size: number): Promise<void> {
  const publicId = newPublicId()
  const image = await Image.create({ name, slug: toSlug(name), currentVersion: 1 }, { set: { publicId } })
  await ImageVersion.create(
    {
      format: 'webp',
      mime: 'image/webp',
      ext: 'webp',
      size,
      width: 640,
      height: 480,
      sha256: `sha-${publicId}`,
      storageKey: `images/${publicId}/v1.webp`,
      thumbKey: `images/${publicId}/v1.thumb.webp`,
      originalName: `${toSlug(name)}.jpg`,
      originalFormat: 'jpeg',
      originalSize: size * 2,
      convertOptions: JSON.stringify({ format: 'webp', quality: 80, maxDimension: null }),
    },
    { set: { imageId: image.id, version: 1 } },
  )
}

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

    // `images` defers (task 1.5): a full visit omits it and announces the key,
    // so the page paints instantly and the client fetches the grid right after.
    const response = await http.json().actingAs(owner).get('/files')
    const page = await response.json<{ props: Record<string, unknown>, deferredProps?: Record<string, string[]> }>()
    expect(page.props.folder).toBeNull()
    expect(page.props.breadcrumbs).toEqual([{ id: null, name: 'My Files' }])
    expect(page.props.folders).toEqual([])
    expect(page.props.images).toBeUndefined()
    expect(page.deferredProps).toEqual({ default: ['images'] })
    expect(owner.passwordHash.startsWith('$scrypt$')).toBe(true)
  })

  it('resolves the deferred images on a partial reload, with permanent URLs', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    await seedImage('Alpha', 100)
    await seedImage('Beta', 200)

    const response = await http
      .json()
      .actingAs(owner)
      .withHeaders({
        'X-Inertia': 'true',
        'X-Inertia-Partial-Component': 'drive/Index',
        'X-Inertia-Partial-Data': 'images',
      })
      .get('/files')

    const page = await response.json<{ props: { images: Array<Record<string, unknown>> } }>()
    const images = page.props.images
    expect(images).toHaveLength(2)
    expect(images.map((image) => image.name)).toEqual(['Alpha', 'Beta'])
    for (const image of images) {
      expect(image.version).toBe(1)
      expect(image.starred).toBe(false)
      const urls = image.urls as Record<string, string>
      expect(urls.thumb).toContain(`/t/${String(image.publicId)}/`)
      expect(urls.latest).toContain(`/i/${String(image.publicId)}`)
    }
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

  it('renders a folder page with its breadcrumb chain and children', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const a = await Folder.create({ name: 'Trips' })
    const b = await Folder.create({ name: '2024', parentId: a.id })
    await seedImage('Beach', 100)

    // Beach lives in Trips: it must appear there, not at the root.
    await Image.where({ id: (await Image.where({ name: 'Beach' }).firstOrFail()).id }).update({ folderId: a.id })

    const full = await (await http.json().actingAs(owner).get(`/files/${a.id}`)).json<{
      props: Record<string, unknown>, deferredProps?: Record<string, string[]>,
    }>()
    expect(full.props.folder).toMatchObject({ id: a.id, name: 'Trips', parentId: null })
    expect(full.props.breadcrumbs).toEqual([
      { id: null, name: 'My Files' },
      { id: a.id, name: 'Trips' },
    ])
    expect(full.props.folders).toMatchObject([{ id: b.id, name: '2024' }])
    expect(full.deferredProps).toEqual({ default: ['images'] })

    const partial = await http
      .json()
      .actingAs(owner)
      .withHeaders({
        'X-Inertia': 'true',
        'X-Inertia-Partial-Component': 'drive/Index',
        'X-Inertia-Partial-Data': 'images',
      })
      .get(`/files/${a.id}`)
    const page = await partial.json<{ props: { images: Array<{ name: string }> } }>()
    expect(page.props.images.map((image) => image.name)).toEqual(['Beach'])
  })

  it('keeps root images out of folder pages', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const folder = await Folder.create({ name: 'Trips' })
    await seedImage('Root beach', 100)

    const partial = await http
      .json()
      .actingAs(owner)
      .withHeaders({
        'X-Inertia': 'true',
        'X-Inertia-Partial-Component': 'drive/Index',
        'X-Inertia-Partial-Data': 'images',
      })
      .get(`/files/${folder.id}`)
    const page = await partial.json<{ props: { images: unknown[] } }>()
    expect(page.props.images).toEqual([])
  })

  it('sends an unknown or trashed folder id to the 404 page', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    // `deletedAt` is server-chosen (never request input), so it lands via set.
    const trashed = await Folder.create({ name: 'Gone' }, { set: { deletedAt: Date.now() } })

    await http.json().actingAs(owner).get('/files/99999').assertNotFound()
    await http.json().actingAs(owner).get(`/files/${trashed.id}`).assertNotFound()
    await http.json().actingAs(owner).get('/files/not-a-number').assertNotFound()
  })
})
