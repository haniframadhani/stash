import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { MemoryStorageDriver, StorageManager, type StorageDriver } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { Image, type ImageRecord } from '../../app/Models/Image.js'
import { Folder } from '../../app/Models/Folder.js'
import { ImageVersion, type ImageVersionRecord } from '../../app/Models/ImageVersion.js'
import { ImageStore, newPublicId } from '../../app/Services/ImageStore.js'
import { toSlug } from '../../app/Services/Slug.js'
import { replaceImage } from '../../app/Services/Uploads.js'
import { UrlBuilder } from '../../app/Services/UrlBuilder.js'
import { ImageItem } from '../../app/Http/Resources/ImageItem.js'
import type { ImageSettings } from '../../config/images.js'
import { User } from '../../app/Models/User.js'
import sharp from 'sharp'

let http: TestApp
let disposer: Disposable | undefined
let disk: MemoryStorageDriver

function spyingDriver(under: MemoryStorageDriver): StorageDriver {
  return {
    put: (path, content, options) => under.put(path, content, options),
    putFile: (path, localPath, options) => under.putFile(path, localPath, options),
    get: async (path) => {
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

beforeAll(async () => {
  http = await TestApp.fromApp(app)
  disk = new MemoryStorageDriver({})
  const manager = new StorageManager({ default: 'spy' })
  manager.registerDisk('spy', () => spyingDriver(disk))
  disposer = app.container.fake('storage', manager)
})

afterAll(() => {
  disposer?.[Symbol.dispose]()
})

beforeEach(async () => {
  await resetDatabase()
  disk.clear()
})

/** A seeded image, backed by a memory storage so public delivery works. */
async function seedImage(name = 'Sunset beach'): Promise<{ image: ImageRecord, version: ImageVersionRecord, publicId: string, oldSlug: string, bytes: Buffer }> {
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

  const image = await Image.create({ name, slug, currentVersion: 1 }, { set: { publicId, deletedAt: null } })
  const version = await ImageVersion.create({
    format: 'webp',
    mime: 'image/webp',
    ext: 'webp',
    size: bytes.length,
    width: 10,
    height: 10,
    sha256: 'sha256mock',
    storageKey: keys.storageKey,
    thumbKey: keys.thumbKey,
    originalName: name,
    originalFormat: 'jpeg',
    originalSize: 1234,
    convertOptions: '{}',
  }, { set: { imageId: image.id, version: 1 } })
  return { image, version, publicId, oldSlug: slug, bytes }
}

/** A signed-in, CSRF‑primed client as a fresh owner. */
async function authClient(): Promise<TestApp> {
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
  return http.actingAs(owner).withCsrf()
}

describe('image routes (task 2.2)', () => {
  it('rejects a guest rename', async () => {
    const { image } = await seedImage()
    await http.patch(`/images/${image.id}`, { name: 'New name' }).assertForbidden()
  })

  it('renames and redirects back to its folder (root)', async () => {
    const client = await authClient()
    const { image } = await seedImage()
    const response = await client.patch(`/images/${image.id}`, { name: 'New name' })
    await response.assertRedirect('/files')
    expect((await Image.find(image.id))?.name).toBe('New name')
  })

  it('renames and redirects back to its folder (sub‑folder)', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const folder = await Folder.create({ name: 'Trips' })
    const client = await http.actingAs(owner).withCsrf()
    const { image } = await seedImage()
    await Image.update({ id: image.id }, { folderId: folder.id }, { set: {} })
    await client.patch(`/images/${image.id}`, { name: 'New name' }).assertRedirect(`/files/${folder.id}`)
    expect((await Image.find(image.id))?.name).toBe('New name')
  })

  it('updates name and slug but not currentVersion or storage', async () => {
    const client = await authClient()
    const { image, version } = await seedImage()
    const originalVersion = version.version
    const originalStorageKey = version.storageKey

    await client.patch(`/images/${image.id}`, { name: 'New name' })

    const updatedImage = await Image.find(image.id)
    expect(updatedImage?.name).toBe('New name')
    expect(updatedImage?.slug).toBe(toSlug('New name'))
    expect(updatedImage?.currentVersion).toBe(1)

    const updatedVersion = await ImageVersion.first({ imageId: image.id, version: originalVersion })
    expect(updatedVersion?.version).toBe(originalVersion)
    expect(updatedVersion?.storageKey).toBe(originalStorageKey)
    expect(updatedVersion?.ext).toBe('webp')
  })

  it('keeps the pinned preview URL working after rename', async () => {
    const client = await authClient()
    const { image, publicId, oldSlug, bytes } = await seedImage()
    await client.patch(`/images/${image.id}`, { name: 'New name' })

    // Old slug, version 1 still served (lookup ignores slug)
    const response = await client.get(`/preview/${publicId}/${oldSlug}.v1.webp`).assertOk()
    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Content-Length', String(bytes.length))
    expect(await response.text()).toBe(bytes.toString())
  })

  it('answers 422 with a sibling clash error on rename', async () => {
    const client = await authClient()
    const { image } = await seedImage('Sunset beach')
    await seedImage('Ocean view')

    const response = await client.patch(`/images/${image.id}`, { name: 'Ocean view' })
    await response.assertUnprocessable()
    const body = await response.json<{ errors: Record<string, string[]> }>()
    expect(body.errors.name).toContain('An image with this name already exists.')
  })

  it('answers 422 for a name containing /', async () => {
    const client = await authClient()
    const { image } = await seedImage()
    await client.patch(`/images/${image.id}`, { name: 'bad/name' }).assertUnprocessable()
      .assertJsonPath('errors.name.0', 'Image names cannot contain / or \\.')
  })

  it('404s an unknown image', async () => {
    const client = await authClient()
    await client.patch('/images/999999', { name: 'X' }).assertNotFound()
  })

  it('404s a trashed image', async () => {
    const client = await authClient()
    const { image } = await seedImage()
    await Image.update({ id: image.id }, {}, { set: { deletedAt: Date.now() } })
    await client.patch(`/images/${image.id}`, { name: 'New' }).assertNotFound()
  })
})

// Task 3.1 (docs/IMAGE_PIPELINE.md §4, §7): replace appends version n+1 over
// the same publicId, flips the pointer in one transaction, and prunes beyond
// KEEP_VERSIONS. Old versions keep their keys, so their permanent links work.
function jpegBytes(background = 'red'): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background } }).jpeg({ quality: 90 }).toBuffer()
}

function replaceForm(bytes: Buffer, fields: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], 'replacement.jpg', { type: 'image/jpeg' }))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

const settings = () => app.container.make<ImageSettings>('images')

describe('images.replace (task 3.1)', () => {
  it('writes v2, flips current_version and keeps v1 readable with its own bytes', async () => {
    const client = await authClient()
    const { image, publicId, oldSlug, bytes } = await seedImage()
    const replacement = await jpegBytes('blue')

    const response = await client
      .post(`/images/${image.id}/versions`, replaceForm(replacement))
      .assertCreated()

    const body = await response.json<{
      image: { version: number, name: string, format: string, urls: { view: string, thumb: string } }
      originalSize: number
      storedSize: number
      savedPercent: number
    }>()
    expect(body.image.version).toBe(2)
    expect(body.image.name).toBe(image.name)
    expect(body.image.format).toBe('webp')
    expect(body.image.urls.view.endsWith('.v2.webp')).toBe(true)
    expect(body.image.urls.thumb.endsWith('.v2.thumb.webp')).toBe(true)
    expect(body.originalSize).toBe(replacement.length)

    const updated = await Image.find(image.id)
    expect(updated?.currentVersion).toBe(2)
    expect(updated?.name).toBe(image.name)

    // v1 is untouched at its key and still served by the pinned link.
    expect(await disk.get(`images/${publicId}/v1.webp`)).toEqual(bytes)
    const oldLink = await client.get(`/preview/${publicId}/${oldSlug}.v1.webp`).assertOk()
    oldLink.assertHeader('Content-Type', 'image/webp')
    expect(await oldLink.text()).toBe(bytes.toString())

    // v2 is a different key with different bytes and its own sha256.
    const versions = await ImageVersion.where({ imageId: image.id }).orderBy('version', 'asc').get()
    expect(versions.map((row) => row.version)).toEqual([1, 2])
    expect(versions[1]!.storageKey).toBe(`images/${publicId}/v2.webp`)
    expect(versions[1]!.sha256).not.toBe(versions[0]!.sha256)
    expect(await disk.exists(`images/${publicId}/v2.webp`)).toBe(true)
    expect(await disk.exists(`images/${publicId}/v2.thumb.webp`)).toBe(true)
  })

  it('keeps the pointer on the old version when the DB write fails, and deletes the orphan objects', async () => {
    const { image, publicId } = await seedImage()
    // An existing v2 row makes the insert collide, so the transaction rolls
    // back after the objects were already written (§7).
    await ImageVersion.create({
      format: 'webp', mime: 'image/webp', ext: 'webp', size: 1, width: 1, height: 1,
      sha256: 'squatter', storageKey: 'images/squatter/v2.webp', thumbKey: 'images/squatter/v2.thumb.webp',
      originalName: 'squatter', originalFormat: 'jpeg', originalSize: 1, convertOptions: '{}',
    }, { set: { imageId: image.id, version: 2 } })

    await expect(replaceImage({
      image,
      bytes: await jpegBytes(),
      originalName: 'replacement.jpg',
      options: { format: 'webp' },
      settings: settings(),
    })).rejects.toThrow()

    expect((await Image.find(image.id))?.currentVersion).toBe(1)
    // Only v1's two objects remain: the failed v2 objects were cleaned up.
    expect(disk.getAllPaths().sort()).toEqual([
      `images/${publicId}/v1.thumb.webp`,
      `images/${publicId}/v1.webp`,
    ])
  })

  it('prunes beyond KEEP_VERSIONS, oldest first, never the current version', async () => {
    const { image, publicId } = await seedImage()
    const keepTwo: ImageSettings = { ...settings(), keepVersions: 2 }

    let current = image
    for (let index = 0; index < 3; index++) {
      const stored = await replaceImage({
        image: current,
        bytes: await jpegBytes(['red', 'green', 'blue'][index]!),
        originalName: 'replacement.jpg',
        options: { format: 'webp' },
        settings: keepTwo,
      })
      current = stored.image
    }

    expect(current.currentVersion).toBe(4)
    const versions = await ImageVersion.where({ imageId: image.id }).orderBy('version', 'asc').get()
    expect(versions.map((row) => row.version)).toEqual([3, 4])
    expect(disk.getAllPaths().sort()).toEqual([
      `images/${publicId}/v3.thumb.webp`,
      `images/${publicId}/v3.webp`,
      `images/${publicId}/v4.thumb.webp`,
      `images/${publicId}/v4.webp`,
    ])
  })

  it('rejects a guest and an unknown or trashed image', async () => {
    const { image } = await seedImage()
    const guest = await http.post(`/images/${image.id}/versions`, replaceForm(await jpegBytes()))
    expect([401, 403, 302]).toContain(guest.status)
    expect((await Image.find(image.id))?.currentVersion).toBe(1)

    const client = await authClient()
    await client.post('/images/999999/versions', replaceForm(await jpegBytes())).assertNotFound()

    await Image.update({ id: image.id }, {}, { set: { deletedAt: Date.now() } })
    await client.post(`/images/${image.id}/versions`, replaceForm(await jpegBytes())).assertNotFound()
    expect(await ImageVersion.where({ imageId: image.id }).count()).toBe(1)
  })
})

// Task 3.2 (docs/IMAGE_PIPELINE.md §4): "Make current" moves the pointer to an
// existing version only. No object is written or deleted, so both pinned links
// keep working; a pruned or unknown version is a 404.
describe('images.restoreVersion (task 3.2)', () => {
  async function imageWithTwoVersions() {
    const client = await authClient()
    const seeded = await seedImage()
    await client
      .post(`/images/${seeded.image.id}/versions`, replaceForm(await jpegBytes('blue')))
      .assertCreated()
    const v2 = (await ImageVersion.first({ imageId: seeded.image.id, version: 2 }))!
    return { client, ...seeded, v2 }
  }

  it('moves only the pointer and leaves both pinned versions readable', async () => {
    const { client, image, publicId, oldSlug, bytes, v2 } = await imageWithTwoVersions()
    const v2Bytes = (await disk.get(v2.storageKey))!

    await client.post(`/images/${image.id}/versions/1/restore`, {}).assertRedirect('/files')

    expect((await Image.find(image.id))?.currentVersion).toBe(1)
    // Objects and rows are untouched: only the pointer moved.
    expect((await ImageVersion.where({ imageId: image.id }).count())).toBe(2)
    expect(await disk.get(`images/${publicId}/v2.webp`)).toEqual(v2Bytes)

    const v1 = await client.get(`/preview/${publicId}/${oldSlug}.v1.webp`).assertOk()
    expect(await v1.text()).toBe(bytes.toString())
    const pinned = await client.get(`/preview/${publicId}/${oldSlug}.v2.webp`).assertOk()
    pinned.assertHeader('Content-Length', String(v2.size))

    // The current version (the "latest" view) is v1 again.
    const page = await client
      .withHeaders({
        'X-Inertia': 'true',
        'X-Inertia-Partial-Component': 'drive/Index',
        'X-Inertia-Partial-Data': 'images',
      })
      .get('/files')
    const props = await page.json<{ props: { images: Array<{ id: number, version: number, urls: { view: string }, versions: Array<{ version: number, isCurrent: boolean, permanent: string | null }> }> } }>()
    const item = props.props.images.find((candidate) => candidate.id === image.id)!
    expect(item.version).toBe(1)
    expect(item.urls.view.endsWith('.v1.webp')).toBe(true)
    expect(item.versions.map((row) => row.version)).toEqual([2, 1])
    expect(item.versions.map((row) => row.isCurrent)).toEqual([false, true])
  })

  it('answers 404 for a pruned version and for an unknown one', async () => {
    const client = await authClient()
    const { image } = await seedImage()
    // keepVersions=1 prunes v1 when v2 lands, so v1's row and objects are gone.
    await replaceImage({
      image,
      bytes: await jpegBytes('green'),
      originalName: 'replacement.jpg',
      options: { format: 'webp' },
      settings: { ...settings(), keepVersions: 1 },
    })
    expect(await ImageVersion.first({ imageId: image.id, version: 1 })).toBeNull()

    await client.post(`/images/${image.id}/versions/1/restore`, {}).assertNotFound()
    await client.post(`/images/${image.id}/versions/99/restore`, {}).assertNotFound()
    expect((await Image.find(image.id))?.currentVersion).toBe(2)
  })

  it('rejects a guest and a trashed image', async () => {
    const { image } = await seedImage()
    const guest = await http.post(`/images/${image.id}/versions/1/restore`, {})
    expect([401, 403, 302]).toContain(guest.status)

    const client = await authClient()
    await Image.update({ id: image.id }, {}, { set: { deletedAt: Date.now() } })
    await client.post(`/images/${image.id}/versions/1/restore`, {}).assertNotFound()
  })

  it('builds a permanent bucket link for every version when a files domain is set', async () => {
    const { image, version, publicId } = await seedImage()
    const versions = [version, { ...version, version: 2, ext: 'avif' }]
    const data = new ImageItem(
      { image: { ...image, currentVersion: 2 }, version: versions[1]!, versions },
      new UrlBuilder('https://files.test/'),
    ).toJSON()

    expect(data.versions?.map((row) => row.permanent)).toEqual([
      `https://files.test/images/${publicId}/v2.avif`,
      `https://files.test/images/${publicId}/v1.webp`,
    ])
    expect(data.versions?.map((row) => row.view)).toEqual([
      `https://files.test/images/${publicId}/v2.avif`,
      `https://files.test/images/${publicId}/v1.webp`,
    ])
  })
})