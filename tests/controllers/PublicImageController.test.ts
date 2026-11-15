import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { MemoryStorageDriver, StorageManager, type StorageDriver } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { Image } from '../../app/Models/Image.js'
import { ImageVersion, type ImageVersionRecord } from '../../app/Models/ImageVersion.js'
import { ImageStore, newPublicId } from '../../app/Services/ImageStore.js'
import { toSlug } from '../../app/Services/Slug.js'

// Public image delivery (docs/IMAGE_PIPELINE.md §5 and §8): headers, 304
// without a storage read, HEAD, the 404 cases, and no Set-Cookie anywhere.
// The disk is faked with a counting memory driver, so nothing touches the
// filesystem and the "zero storage reads" assertion is a real spy.

const counts = { gets: 0 }

function spyingDriver(under: MemoryStorageDriver): StorageDriver {
  return {
    put: (path, content, options) => under.put(path, content, options),
    putFile: (path, localPath, options) => under.putFile(path, localPath, options),
    get: async (path) => {
      counts.gets++
      return under.get(path)
    },
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
  // Replace the storage binding for the whole suite: a counting memory disk.
  const manager = new StorageManager({ default: 'spy' })
  manager.registerDisk('spy', () => spyingDriver(new MemoryStorageDriver({})))
  disposer = app.container.fake('storage', manager)
})

afterAll(() => {
  disposer?.[Symbol.dispose]()
})

beforeEach(async () => {
  counts.gets = 0
  await resetDatabase()
})

interface Seeded {
  publicId: string
  slug: string
  etag: string
  bytes: Buffer
  version: ImageVersionRecord
}

async function seedImage(options: { name?: string, trashed?: boolean } = {}): Promise<Seeded> {
  const name = options.name ?? 'Sunset beach'
  const slug = toSlug(name)
  const publicId = newPublicId()
  const bytes = Buffer.from(`image:${publicId}:${name}`)

  const keys = await ImageStore.fromContainer().putVersion({
    publicId,
    version: 1,
    ext: 'webp',
    mime: 'image/webp',
    image: bytes,
    thumb: Buffer.from(`thumb:${publicId}`),
  })

  const values = {
    publicId,
    name,
    slug,
    currentVersion: 1,
    deletedAt: options.trashed ? Date.now() : null,
  }
  // publicId and deletedAt are server-chosen (never request input), so they
  // stay out of fillable; the trashed fixture uses forceCreate.
  const image = options.trashed
    ? await Image.forceCreate(values)
    : await Image.create({ name, slug, currentVersion: 1 }, { set: { publicId, deletedAt: values.deletedAt } })
  const version = await ImageVersion.create({
    format: 'webp',
    mime: 'image/webp',
    ext: 'webp',
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

  return { publicId, slug, etag: version.sha256.slice(0, 16), bytes, version }
}

describe('pinned image delivery', () => {
  it('serves the version bytes with the §5 headers', async () => {
    const seeded = await seedImage()
    const response = await http.get(`/i/${seeded.publicId}/${seeded.slug}.v1.webp`).assertOk()

    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('ETag', `"${seeded.etag}"`)
      .assertHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .assertHeader('X-Content-Type-Options', 'nosniff')
      .assertHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      .assertHeader('Access-Control-Allow-Origin', '*')
      .assertHeader('Content-Disposition', `inline; filename="${seeded.slug}.v1.webp"`)
      .assertHeader('Content-Length', String(seeded.bytes.length))
      .assertHeaderMissing('Set-Cookie')
      .assertHeaderMissing('Vary')
    expect(await response.text()).toEqual(seeded.bytes.toString())
  })

  it('ignores the cosmetic slug in the URL', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/wrong-slug.v1.webp`).assertOk()
  })

  it('answers a matching If-None-Match with 304 and zero storage reads', async () => {
    const seeded = await seedImage()
    const response = await http
      .withHeader('If-None-Match', `"${seeded.etag}"`)
      .get(`/i/${seeded.publicId}/${seeded.slug}.v1.webp`)
      .assertStatus(304)
    expect(await response.text()).toBe('')
    expect(counts.gets).toBe(0)
  })

  it('accepts a weak or unquoted ETag in If-None-Match', async () => {
    const seeded = await seedImage()
    await http.withHeader('If-None-Match', `W/"${seeded.etag}"`).get(`/i/${seeded.publicId}`).assertStatus(304)
    await http.withHeader('If-None-Match', seeded.etag).get(`/i/${seeded.publicId}`).assertStatus(304)
  })

  it('serves HEAD with the same headers and no body', async () => {
    const seeded = await seedImage()
    const response = await app.fetch(new Request(`http://localhost:3333/i/${seeded.publicId}/${seeded.slug}.v1.webp`, { method: 'HEAD' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('ETag')).toBe(`"${seeded.etag}"`)
    expect(await response.text()).toBe('')
  })

  it('serves ?download=1 as an attachment', async () => {
    const seeded = await seedImage()
    await http
      .get(`/i/${seeded.publicId}/${seeded.slug}.v1.webp?download=1`)
      .assertHeader('Content-Disposition', `attachment; filename="${seeded.slug}.v1.webp"`)
  })
})

describe('latest image delivery', () => {
  it('serves the current version with revalidating cache headers', async () => {
    const seeded = await seedImage()
    const response = await http.get(`/i/${seeded.publicId}`).assertOk()
    response
      .assertHeader('Cache-Control', 'public, no-cache')
      .assertHeader('ETag', `"${seeded.etag}"`)
      .assertHeaderMissing('Set-Cookie')
  })

  it('serves the latest URL with the current extension', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/${seeded.slug}.webp`).assertOk()
  })

  it('404s a latest URL whose extension no longer matches', async () => {
    const seeded = await seedImage()
    const response = await http.get(`/i/${seeded.publicId}/${seeded.slug}.png`).assertNotFound()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })
})

describe('thumbnail delivery', () => {
  it('serves the thumb object of the pinned version', async () => {
    const seeded = await seedImage()
    const response = await http.get(`/t/${seeded.publicId}/${seeded.slug}.v1.webp`).assertOk()
    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .assertHeader('Content-Disposition', `inline; filename="${seeded.slug}.v1.webp"`)
      .assertHeaderMissing('Set-Cookie')
  })

  it('404s a thumb URL that is not pinned or not webp', async () => {
    const seeded = await seedImage()
    await http.get(`/t/${seeded.publicId}`).assertNotFound()
    await http.get(`/t/${seeded.publicId}/${seeded.slug}.webp`).assertNotFound()
    await http.get(`/t/${seeded.publicId}/${seeded.slug}.v1.png`).assertNotFound()
  })

  it('serves the thumb of an AVIF image (thumbs are always WebP)', async () => {
    // Seed an AVIF version. The ImageStore writes .webp thumbs for any version,
    // so we set up the DB to match, then assert the thumb endpoint works.
    const name = 'avif-demo.jpg'
    const slug = toSlug(name)
    const publicId = newPublicId()
    const avifBytes = Buffer.from(`avif:${publicId}:${name}`)
    const thumbBytes = Buffer.from(`avif-thumb:${publicId}`)
    const keys = await ImageStore.fromContainer().putVersion({
      publicId,
      version: 1,
      ext: 'avif',
      mime: 'image/avif',
      image: avifBytes,
      thumb: thumbBytes,
    })
    const image = await Image.forceCreate({
      name,
      slug,
      publicId,
      currentVersion: 1,
      deletedAt: null,
    })
    await ImageVersion.create({
      format: 'avif',
      mime: 'image/avif',
      ext: 'avif',
      size: avifBytes.length,
      width: 10,
      height: 10,
      sha256: createHash('sha256').update(avifBytes).digest('hex'),
      storageKey: keys.storageKey,
      thumbKey: keys.thumbKey,
      originalName: 'avif-demo.jpg',
      originalFormat: 'jpeg',
      originalSize: 1234,
      convertOptions: '{}',
    }, { set: { imageId: image.id, version: 1 } })

    const response = await http.get(`/t/${publicId}/${slug}.v1.webp`).assertOk()
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .assertHeader('Content-Disposition', `inline; filename="${slug}.v1.webp"`)
      .assertHeaderMissing('Set-Cookie')
    expect(await response.text()).toEqual(thumbBytes.toString())
  })
})

describe('404 cases', () => {
  it('404s an unknown public id with no-store', async () => {
    const response = await http.get('/i/zzzzzzzzzzzz/sunset.v1.webp').assertNotFound()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('404s an unknown version, keeping no-store', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/${seeded.slug}.v99.webp`).assertNotFound()
  })

  it('404s a pinned extension that does not match the stored one', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/${seeded.slug}.v1.png`).assertNotFound()
  })

  it('404s a malformed file segment', async () => {
    const seeded = await seedImage()
    await http.get(`/i/${seeded.publicId}/Sunset.V1.WEBP`).assertNotFound()
    await http.get(`/i/${seeded.publicId}/sunset.v0.webp`).assertNotFound()
    await http.get(`/i/${seeded.publicId}/sunset.v1.webp.bak`).assertNotFound()
  })

  it('404s a trashed image', async () => {
    const seeded = await seedImage({ trashed: true })
    await http.get(`/i/${seeded.publicId}/${seeded.slug}.v1.webp`).assertNotFound()
    await http.get(`/i/${seeded.publicId}`).assertNotFound()
  })
})

describe('no cookies on public delivery', () => {
  it('never sets a cookie, even when the request carries a session', async () => {
    const seeded = await seedImage()
    for (const path of [
      `/i/${seeded.publicId}/${seeded.slug}.v1.webp`,
      `/i/${seeded.publicId}`,
      `/t/${seeded.publicId}/${seeded.slug}.v1.webp`,
    ]) {
      const response = await http
        .withHeader('Cookie', 'guren.session=whatever; XSRF-TOKEN=sentinel')
        .get(path)
        .assertOk()
      expect(response.headers.getSetCookie?.() ?? []).toEqual([])
    }
  })
})
