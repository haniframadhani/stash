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
import { User } from '../../app/Models/User.js'

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

  it('keeps the old permanent URL working after rename', async () => {
    const client = await authClient()
    const { image, publicId, oldSlug, bytes } = await seedImage()
    await client.patch(`/images/${image.id}`, { name: 'New name' })

    // Old slug, version 1 still served (lookup ignores slug)
    const response = await http.get(`/i/${publicId}/${oldSlug}.v1.webp`).assertOk()
    response
      .assertHeader('Content-Type', 'image/webp')
      .assertHeader('Content-Length', String(bytes.length))
      .assertHeaderMissing('Set-Cookie')
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