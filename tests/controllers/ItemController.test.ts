import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { Folder, type FolderRecord } from '../../app/Models/Folder.js'
import { Image, type ImageRecord } from '../../app/Models/Image.js'
import { User } from '../../app/Models/User.js'
import { newPublicId } from '../../app/Services/ImageStore.js'
import { toSlug } from '../../app/Services/Slug.js'

let http: TestApp

beforeAll(async () => {
  http = await TestApp.fromApp(app)
})

beforeEach(async () => {
  await resetDatabase()
})

/** A row is enough for a move: no bytes are read, only `folder_id` changes. */
function seedImage(name: string, folderId: number | null): Promise<ImageRecord> {
  return Image.create(
    { name, slug: toSlug(name), folderId, currentVersion: 1 },
    { set: { publicId: newPublicId() } },
  )
}

async function authClient(): Promise<TestApp> {
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
  return http.actingAs(owner).withCsrf()
}

async function folder(id: number): Promise<FolderRecord | null> {
  return Folder.find(id)
}

async function errorsOf(response: { json<T = unknown>(): Promise<T> }): Promise<Record<string, string[]>> {
  const body = await response.json<{ errors: Record<string, string[]> }>()
  return body.errors
}

describe('items.move (task 2.4)', () => {
  it('rejects a guest move', async () => {
    await http.post('/items/move', { imageIds: [1], folderIds: [], targetFolderId: null }).assertForbidden()
  })

  it('moves images into a folder and redirects to their source folder', async () => {
    const client = await authClient()
    const source = await Folder.create({ name: 'Source' })
    const target = await Folder.create({ name: 'Target' })
    const first = await seedImage('One', source.id)
    const second = await seedImage('Two', source.id)

    await client.post('/items/move', { imageIds: [first.id, second.id], folderIds: [], targetFolderId: target.id })
      .assertRedirect(`/files/${source.id}`)

    expect((await Image.find(first.id))?.folderId).toBe(target.id)
    expect((await Image.find(second.id))?.folderId).toBe(target.id)
  })

  it('moves a folder and redirects to its source page', async () => {
    const client = await authClient()
    const source = await Folder.create({ name: 'Source' })
    const target = await Folder.create({ name: 'Target' })
    const moved = await Folder.create({ name: 'Moved', parentId: source.id })

    await client.post('/items/move', { imageIds: [], folderIds: [moved.id], targetFolderId: target.id })
      .assertRedirect(`/files/${source.id}`)

    expect((await folder(moved.id))?.parentId).toBe(target.id)
  })

  it('moves images and folders to the root', async () => {
    const client = await authClient()
    const source = await Folder.create({ name: 'Source' })
    const image = await seedImage('One', source.id)
    const nested = await Folder.create({ name: 'Nested', parentId: source.id })

    await client.post('/items/move', {
      imageIds: [image.id],
      folderIds: [nested.id],
      targetFolderId: null,
    }).assertRedirect(`/files/${source.id}`)

    expect((await Image.find(image.id))?.folderId).toBeNull()
    expect((await folder(nested.id))?.parentId).toBeNull()
  })

  it('rejects moving a folder into itself and changes nothing', async () => {
    const client = await authClient()
    const folderA = await Folder.create({ name: 'A' })
    const image = await seedImage('One', folderA.id)

    const response = await client.post('/items/move', {
      imageIds: [image.id],
      folderIds: [folderA.id],
      targetFolderId: folderA.id,
    })
    await response.assertUnprocessable()
    expect((await errorsOf(response)).targetFolderId?.[0]).toContain('CYCLE')
    // Atomic: the valid image half of the batch did not move either.
    expect((await folder(folderA.id))?.parentId).toBeNull()
  })

  it('rejects moving a folder into its child', async () => {
    const client = await authClient()
    const parent = await Folder.create({ name: 'Parent' })
    const child = await Folder.create({ name: 'Child', parentId: parent.id })

    const response = await client.post('/items/move', {
      imageIds: [],
      folderIds: [parent.id],
      targetFolderId: child.id,
    })
    await response.assertUnprocessable()
    expect((await errorsOf(response)).targetFolderId?.[0]).toContain('CYCLE')
    expect((await folder(parent.id))?.parentId).toBeNull()
    expect((await folder(child.id))?.parentId).toBe(parent.id)
  })

  it('rejects moving a folder into a deep descendant', async () => {
    const client = await authClient()
    const a = await Folder.create({ name: 'A' })
    const b = await Folder.create({ name: 'B', parentId: a.id })
    const c = await Folder.create({ name: 'C', parentId: b.id })

    const response = await client.post('/items/move', { imageIds: [], folderIds: [a.id], targetFolderId: c.id })
    await response.assertUnprocessable()
    expect((await errorsOf(response)).targetFolderId?.[0]).toContain('CYCLE')
    expect((await folder(a.id))?.parentId).toBeNull()
  })

  it('rejects a missing or trashed destination', async () => {
    const client = await authClient()
    const trashed = await Folder.create({ name: 'Gone' }, { set: { deletedAt: Date.now() } })
    const image = await seedImage('One', null)

    await client.post('/items/move', { imageIds: [image.id], folderIds: [], targetFolderId: 999999 })
      .assertUnprocessable()
    await client.post('/items/move', { imageIds: [image.id], folderIds: [], targetFolderId: trashed.id })
      .assertUnprocessable()
    expect((await Image.find(image.id))?.folderId).toBeNull()
  })

  it('rejects a missing or trashed item in the batch', async () => {
    const client = await authClient()
    const target = await Folder.create({ name: 'Target' })
    const trashed = await seedImage('Gone', null)
    await Image.update({ id: trashed.id }, {}, { set: { deletedAt: Date.now() } })
    const live = await seedImage('Live', null)

    const missing = await client.post('/items/move', {
      imageIds: [live.id, 999999],
      folderIds: [],
      targetFolderId: target.id,
    })
    await missing.assertUnprocessable()
    expect((await errorsOf(missing)).items?.length).toBeGreaterThan(0)

    const gone = await client.post('/items/move', {
      imageIds: [live.id, trashed.id],
      folderIds: [],
      targetFolderId: target.id,
    })
    await gone.assertUnprocessable()
    expect((await Image.find(live.id))?.folderId).toBeNull()
  })

  it('rejects a name clash in the destination without moving anything', async () => {
    const client = await authClient()
    const source = await Folder.create({ name: 'Source' })
    const target = await Folder.create({ name: 'Target' })
    await seedImage('Beach.jpg', target.id)
    const clash = await seedImage('beach.JPG', source.id)
    const fine = await seedImage('Forest.jpg', source.id)

    const response = await client.post('/items/move', {
      imageIds: [clash.id, fine.id],
      folderIds: [],
      targetFolderId: target.id,
    })
    await response.assertUnprocessable()
    expect((await errorsOf(response)).targetFolderId?.[0]).toContain('already exists')
    expect((await Image.find(clash.id))?.folderId).toBe(source.id)
    expect((await Image.find(fine.id))?.folderId).toBe(source.id)
  })

  it('rejects a folder name clash in the destination', async () => {
    const client = await authClient()
    const target = await Folder.create({ name: 'Target' })
    await Folder.create({ name: 'Trips', parentId: target.id })
    const moving = await Folder.create({ name: 'trips' })

    const response = await client.post('/items/move', {
      imageIds: [],
      folderIds: [moving.id],
      targetFolderId: target.id,
    })
    await response.assertUnprocessable()
    expect((await errorsOf(response)).targetFolderId?.[0]).toContain('already exists')
    expect((await folder(moving.id))?.parentId).toBeNull()
  })

  it('treats items already in the destination as a no-op', async () => {
    const client = await authClient()
    const target = await Folder.create({ name: 'Target' })
    const image = await seedImage('One', target.id)

    await client.post('/items/move', { imageIds: [image.id], folderIds: [], targetFolderId: target.id })
      .assertRedirect(`/files/${target.id}`)
    expect((await Image.find(image.id))?.folderId).toBe(target.id)
  })

  it('whitespace and empty batches are rejected', async () => {
    const client = await authClient()
    await client.post('/items/move', { imageIds: [], folderIds: [], targetFolderId: null }).assertUnprocessable()
  })

  it('caps a batch at 500 items', async () => {
    const client = await authClient()
    const ids = Array.from({ length: 501 }, (_, index) => index + 1)
    await client.post('/items/move', { imageIds: ids, folderIds: [], targetFolderId: null }).assertUnprocessable()
  })
})
