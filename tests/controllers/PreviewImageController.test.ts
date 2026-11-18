import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { MemoryStorageDriver, StorageManager, type StorageDriver } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { Image } from '../../app/Models/Image.js'
import { ImageVersion } from '../../app/Models/ImageVersion.js'
import { User } from '../../app/Models/User.js'
import { ImageStore, newPublicId } from '../../app/Services/ImageStore.js'
import { toSlug } from '../../app/Services/Slug.js'

// The private preview route (docs/ROUTES_SPEC.md §1, IMAGE_PIPELINE.md §5).
// Shared images are served by the bucket domain, never by the app; this route
// only keeps the local UI working when no files domain is configured, so every
// request must carry a session. The disk is a memory driver, so nothing
// touches the filesystem.

function spyingDriver(under: MemoryStorageDriver): StorageDriver {
  return {
    put: (path, content, options) => under.put(path, content, options),
    putFile: (path, localPath, options) => under.putFile(path, localPath, options),
    get: (path) => under.get(path),
    getAsString: (path) => under.getAsString(path),
    exists: (path) => under.exists(path),
    delete: (path) => under.delete(path),
    deleteMany: (paths) => under.deleteMany(paths),
    copy: (from, to) => under.copy(from, to),
    move: (from, to) => under.move(from, to),
    url: (path) => under.url(path),
    temporaryUrl: (path, expiration) => under.temporaryUrl(path, expiration),
    size: (path) => under.size(path),
    lastModified: (path) => under.lastModified(path),
    metadata: (path) => under.metadata(path),
    files: (directory) => under.files(directory),
    directories: (directory) => under.directories(directory),
    allFiles: (directory) => under.allFiles(directory),
    makeDirectory: (directory) => under.makeDirectory(directory),
    deleteDirectory: (directory) => under.deleteDirectory(directory),
    setVisibility: (path, visibility) => under.setVisibility(path, visibility),
    getVisibility: (path) => under.getVisibility(path),
  }
}

let http: TestApp
let disposer: Disposable | undefined

beforeAll(async () => {
  http = await TestApp.fromApp(app)
  const manager = new StorageManager({ default: 'spy' })
  manager.registerDisk('spy', () => spyingDriver(new MemoryStorageDriver({})))
  disposer = app.container.fake('storage', manager)
})

afterAll(() => {
  disposer?.[Symbol.dispose]()
})

beforeEach(async () => {
  await resetDatabase()
})

async function owner(): Promise<User> {
  return User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
}

interface Seeded {
  publicId: string
  slug: string
  bytes: Buffer
  thumb: Buffer
}

async function seedImage(options: { name?: string, trashed?: boolean, ext?: string } = {}): Promise<Seeded> {
  const name = options.name ?? 'Sunset beach'
  const slug = toSlug(name)
  const ext = options.ext ?? 'webp'
  const mime = ext === 'avif' ? 'image/avif' : 'image/webp'
  const publicId = newPublicId()
  const bytes = Buffer.from(`image:${publicId}:${name}`)
  const thumb = Buffer.from(`thumb:${publicId}`)

  const keys = await ImageStore.fromContainer().putVersion({ publicId, version: 1, ext, mime, image: bytes, thumb })

  const values = { publicId, name, slug, currentVersion: 1, deletedAt: options.trashed ? Date.now() : null }
  const image = options.trashed
    ? await Image.forceCreate(values)
    : await Image.create({ name, slug, currentVersion: 1 }, { set: { publicId, deletedAt: null } })
  await ImageVersion.create({
    format: ext,
    mime,
    ext,
    size: bytes.length,
    width: 10,
    height: 10,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    storageKey: keys.storageKey,
    thumbKey: keys.thumbKey,
    originalName: 'sunset.jpg',
    originalFormat: 'jpeg',
    originalSize: 1234,
    convertOptions: '{}',
  }, { set: { imageId: image.id, version: 1 } })

  return { publicId, slug, bytes, thumb }
}

describe('preview access', () => {
  it('refuses a guest and sends it to the login page', async () => {
    const seeded = await seedImage()
    await http.get(`/preview/${seeded.publicId}/${seeded.slug}.v1.webp`).assertRedirect('/login')
    await http.get(`/preview/${seeded.publicId}/${seeded.slug}.v1.thumb.webp`).assertRedirect('/login')
  })

  it('no longer registers the old public image routes', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/${seeded.slug}.v1.webp`).assertNotFound()
    await http.get(`/i/${seeded.publicId}`).assertNotFound()
    await http.get(`/t/${seeded.publicId}/${seeded.slug}.v1.webp`).assertNotFound()
    await http.get(`/p/${seeded.publicId}`).assertNotFound()
  })
})

describe('pinned image preview', () => {
  it('serves the version bytes with private cache headers', async () => {
    const user = await owner()
    const seeded = await seedImage()
    const response = await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.webp`).assertOk()

    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Cache-Control', 'private, max-age=31536000, immutable')
      .assertHeader('X-Content-Type-Options', 'nosniff')
      .assertHeader('Content-Disposition', `inline; filename="${seeded.slug}.v1.webp"`)
      .assertHeader('Content-Length', String(seeded.bytes.length))
    expect(await response.text()).toEqual(seeded.bytes.toString())
  })

  it('ignores the cosmetic slug in the URL', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/wrong-slug.v1.webp`).assertOk()
  })

  it('serves ?download=1 as an attachment', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http
      .actingAs(user)
      .get(`/preview/${seeded.publicId}/${seeded.slug}.v1.webp?download=1`)
      .assertHeader('Content-Disposition', `attachment; filename="${seeded.slug}.v1.webp"`)
  })
})

describe('thumbnail preview', () => {
  it('serves the thumb object, always webp', async () => {
    const user = await owner()
    const seeded = await seedImage({ ext: 'avif' })
    const response = await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.thumb.webp`).assertOk()
    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Content-Disposition', `inline; filename="${seeded.slug}.v1.thumb.webp"`)
    expect(await response.text()).toEqual(seeded.thumb.toString())
  })

  it('404s a thumb URL that is not pinned', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.webp`).assertNotFound()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.png`).assertNotFound()
  })
})

describe('404 cases', () => {
  it('404s an unknown public id with no-store', async () => {
    const user = await owner()
    const response = await http.actingAs(user).get('/preview/zzzzzzzzzzzz/sunset.v1.webp').assertNotFound()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('404s an unknown version', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v99.webp`).assertNotFound()
  })

  it('404s an extension that does not match the stored one', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.png`).assertNotFound()
  })

  it('404s a malformed file segment', async () => {
    const user = await owner()
    const seeded = await seedImage()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/Sunset.V1.WEBP`).assertNotFound()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/sunset.v0.webp`).assertNotFound()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/sunset.v1.webp.bak`).assertNotFound()
  })

  it('404s a trashed image', async () => {
    const user = await owner()
    const seeded = await seedImage({ trashed: true })
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.webp`).assertNotFound()
    await http.actingAs(user).get(`/preview/${seeded.publicId}/${seeded.slug}.v1.thumb.webp`).assertNotFound()
  })
})
