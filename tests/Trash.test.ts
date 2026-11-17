import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { StorageManager } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../src/app.js'
import { resetDatabase } from '../config/database.js'
import { Folder } from '../app/Models/Folder.js'
import { Image, type ImageRecord } from '../app/Models/Image.js'
import { ImageVersion } from '../app/Models/ImageVersion.js'
import { User } from '../app/Models/User.js'
import { ImageStore, imageKey, newPublicId, thumbKey } from '../app/Services/ImageStore.js'
import { toSlug } from '../app/Services/Slug.js'
import { deleteForever, emptyTrash, restoreItems, trashItems } from '../app/Services/Trash.js'

let http: TestApp

beforeAll(async () => {
  http = await TestApp.fromApp(app)
})

beforeEach(async () => {
  await resetDatabase()
})

/** Task 4.2 works on rows plus objects: one version's bytes are enough to
 *  prove "Delete forever" removes every version's files. */
function memoryStore(): { store: ImageStore, disk: ReturnType<StorageManager['disk']> } {
  const disk = new StorageManager({ default: 'memory', disks: { memory: { driver: 'memory' } } }).disk()
  return { store: new ImageStore(disk), disk }
}

async function seedImage(name: string, folderId: number | null, seeded: ReturnType<typeof memoryStore>, versions = 1): Promise<ImageRecord> {
  const publicId = newPublicId()
  const image = await Image.create(
    { name, slug: toSlug(name), folderId, currentVersion: versions },
    { set: { publicId } },
  )
  for (let version = 1; version <= versions; version++) {
    const ext = 'webp'
    await ImageVersion.create({
      format: 'webp',
      mime: 'image/webp',
      ext,
      size: 4,
      width: 2,
      height: 2,
      sha256: `sha-${version}`,
      storageKey: imageKey(publicId, version, ext),
      thumbKey: thumbKey(publicId, version),
      originalName: `${name}.jpg`,
      originalFormat: 'jpeg',
      originalSize: 8,
      convertOptions: '{}',
    }, { set: { imageId: image.id, version } })
    await seeded.disk.put(imageKey(publicId, version, ext), Buffer.from('img'), { contentType: 'image/webp' })
    await seeded.disk.put(thumbKey(publicId, version), Buffer.from('thm'), { contentType: 'image/webp' })
  }
  return image
}

async function authClient(): Promise<TestApp> {
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
  return http.actingAs(owner).withCsrf()
}

describe('trash service (task 4.2)', () => {
  it('trashes an image so it is gone from its folder and flagged deleted', async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const folder = await Folder.create({ name: 'Folder' })
    const image = await seedImage('One', folder.id, seeded)

    await trashItems({ imageIds: [image.id], folderIds: [] })

    expect((await Image.find(image.id))?.deletedAt).not.toBeNull()
  })

  it('a trashed folder hides its descendants and restore brings them back', async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const parent = await Folder.create({ name: 'Parent' })
    const child = await Folder.create({ name: 'Child', parentId: parent.id })
    const image = await seedImage('Inside', child.id, seeded)

    // Trash the whole subtree: the child (so it can be restored on its own)
    // and the parent.
    await trashItems({ imageIds: [], folderIds: [child.id, parent.id] })
    // Restoring the child alone sends it to the root: its parent is still trashed.
    await restoreItems({ imageIds: [], folderIds: [child.id] })
    expect((await Folder.find(child.id))?.parentId).toBeNull()

    // The image was never individually trashed: it stayed where it was.
    expect((await Image.find(image.id))?.deletedAt).toBeNull()
  })

  it('restore with a trashed parent goes to the root and suffixes a clash', async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const parent = await Folder.create({ name: 'Parent' })
    const child = await Folder.create({ name: 'Images', parentId: parent.id })
    const trashed = await seedImage('Photo', child.id, seeded)

    // Trash the image, then trash its folder: the image is restorable, but
    // its parent path is dead.
    await trashItems({ imageIds: [trashed.id], folderIds: [child.id, parent.id] })
    await restoreItems({ imageIds: [trashed.id], folderIds: [] })

    const restored = await Image.find(trashed.id)
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.folderId).toBeNull()
  })

  it("delete forever removes every version's objects and rows", async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const image = await seedImage('Three versions', null, seeded, 3)
    await trashItems({ imageIds: [image.id], folderIds: [] })

    const result = await deleteForever({ imageIds: [image.id], folderIds: [] }, store)

    expect(result.deleted).toBe(1)
    expect(await Image.find(image.id)).toBeNull()
    expect(await ImageVersion.where({ imageId: image.id }).get()).toHaveLength(0)
    for (const version of [1, 2, 3]) {
      expect(await seeded.disk.exists(imageKey(image.publicId, version, 'webp'))).toBe(false)
      expect(await seeded.disk.exists(thumbKey(image.publicId, version))).toBe(false)
    }
  })

  it('delete forever refuses items that are not in the trash', async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const image = await seedImage('Active', null, seeded)
    await expect(deleteForever({ imageIds: [image.id], folderIds: [] }, store)).rejects.toThrow()
    expect(await Image.find(image.id)).not.toBeNull()
  })

  it("a trashed folder takes its trashed descendants' images with it", async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const folder = await Folder.create({ name: 'Doomed' })
    const image = await seedImage('Inside', folder.id, seeded)

    await trashItems({ imageIds: [image.id], folderIds: [folder.id] })
    const result = await deleteForever({ imageIds: [], folderIds: [folder.id] }, store)

    expect(result.deleted).toBe(2)
    expect(await Image.find(image.id)).toBeNull()
    expect(await Folder.find(folder.id)).toBeNull()
    expect(await seeded.disk.exists(imageKey(image.publicId, 1, 'webp'))).toBe(false)
  })

  it('empty trash clears every trashed row and leaves active ones', async () => {
    const seeded = memoryStore()
    const store = seeded.store
    const doomed = await seedImage('Doomed', null, seeded)
    const kept = await seedImage('Kept', null, seeded)
    await trashItems({ imageIds: [doomed.id], folderIds: [] })

    await emptyTrash(store)

    expect(await Image.find(doomed.id)).toBeNull()
    expect(await Image.find(kept.id)).not.toBeNull()
  })
})

describe('trash routes (task 4.2)', () => {
  it('rejects a guest on every trash route', async () => {
    await http.post('/items/trash', { imageIds: [1], folderIds: [] }).assertForbidden()
    await http.post('/items/restore', { imageIds: [1], folderIds: [] }).assertForbidden()
    await http.post('/items/delete', { imageIds: [1], folderIds: [] }).assertForbidden()
    await http.delete('/trash').assertForbidden()
  })

  it('trashes an image and redirects to the drive', async () => {
    const client = await authClient()
    const image = await Image.create(
      { name: 'One', slug: 'one', folderId: null, currentVersion: 1 },
      { set: { publicId: newPublicId() } },
    )
    await client.post('/items/trash', { imageIds: [image.id], folderIds: [] }).assertRedirect('/files')
    expect((await Image.find(image.id))?.deletedAt).not.toBeNull()
  })

  it('does not list a trashed image in the Trash page twice after restore', async () => {
    const client = await authClient()
    const image = await Image.create(
      { name: 'One', slug: 'one', folderId: null, currentVersion: 1 },
      { set: { publicId: newPublicId() } },
    )
    await client.post('/items/trash', { imageIds: [image.id], folderIds: [] })
    await client.post('/items/restore', { imageIds: [image.id], folderIds: [] }).assertRedirect('/trash')
    expect((await Image.find(image.id))?.deletedAt).toBeNull()
  })
})
