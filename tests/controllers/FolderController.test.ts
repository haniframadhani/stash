import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'
import { Folder, type FolderRecord } from '../../app/Models/Folder.js'
function activeFolder(id: number): Promise<FolderRecord | null> {
  return Folder.find(id).then((row) => (row === null ? null : row))
}

/** Task 2.1: the folder mutations (ROUTES_SPEC §4 folders.store/update).
 *  Every mutating request runs under CSRF (actingAs → withCsrf), guests are
 *  rejected, and cycle/move rules answer 422. */
describe('folder routes', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('rejects a guest mutation', async () => {
    await http.post('/folders', { name: 'Trips' }).assertForbidden()
    await http.patch('/folders/1', { name: 'Trips' }).assertForbidden()
  })

  it('creates a root folder and redirects back to My Files', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.post('/folders', { name: 'Trips' }).assertRedirect('/files')

    const rows = await Folder.where({ name: 'Trips' }).get()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.parentId).toBeNull()
  })

  it('creates a folder inside the folder being browsed and redirects back to it', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const parent = await Folder.create({ name: 'Trips' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.post('/folders', { name: '2024', parentId: parent.id }).assertRedirect(`/files/${parent.id}`)
    expect((await activeFolder((await Folder.where({ name: '2024' }).firstOrFail()).id))?.parentId).toBe(parent.id)  })

  it('suffixes a sibling name clash on create', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.post('/folders', { name: 'Trips' }).assertRedirect('/files')
    await browser.post('/folders', { name: 'Trips' }).assertRedirect('/files')

    const rows = await Folder.whereNull('deletedAt').get()
    expect(rows.map((row) => row.name).sort()).toEqual(['Trips', 'Trips (1)'])
  })

  it('validates the name and the parent', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.post('/folders', { name: '' }).assertUnprocessable()
    await browser.post('/folders', { name: 'a/b' }).assertUnprocessable()
    await browser.post('/folders', { name: 'x'.repeat(256) }).assertUnprocessable()
    await browser.post('/folders', { name: 'Trips', parentId: 99999 }).assertUnprocessable()
    const rows = await Folder.whereNull('deletedAt').get()
    expect(rows).toHaveLength(0)
  })

  it('renames a folder and redirects back to its parent page', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const folder = await Folder.create({ name: 'Trips' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.patch(`/folders/${folder.id}`, { name: 'Vacation' }).assertRedirect('/files')
    expect((await Folder.find(folder.id))?.name).toBe('Vacation')
  })

  it('rejects a rename onto an existing sibling name', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const trips = await Folder.create({ name: 'Trips' })
    const other = await Folder.create({ name: 'Other' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.patch(`/folders/${other.id}`, { name: 'Trips' }).assertUnprocessable()
    expect((await Folder.find(other.id))?.name).toBe('Other')
    expect(trips.name).toBe('Trips')
  })

  it('rejects moving into itself, its child, and a deep descendant with CYCLE', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const a = await Folder.create({ name: 'A' })
    const b = await Folder.create({ name: 'B', parentId: a.id })
    const c = await Folder.create({ name: 'C', parentId: b.id })
    const browser = await http.actingAs(owner).withCsrf()

    for (const target of [a.id, b.id, c.id]) {
      const response = await browser.patch(`/folders/${a.id}`, { parentId: target }).assertUnprocessable()
      const body = await response.json<{ errors?: Record<string, string[]> }>()
      expect(body.errors?.parentId?.[0]).toContain('CYCLE')
    }
    // Nothing moved.
    expect((await Folder.find(a.id))?.parentId).toBeNull()
    expect((await Folder.find(b.id))?.parentId).toBe(a.id)
  })

  it('moves a folder to the root with an explicit null parent', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const a = await Folder.create({ name: 'A' })
    const b = await Folder.create({ name: 'B', parentId: a.id })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.patch(`/folders/${b.id}`, { parentId: null }).assertRedirect('/files')
    expect((await Folder.find(b.id))?.parentId).toBeNull()
  })

  it('answers 404 for an unknown or trashed folder id', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    // `deletedAt` is server-chosen (never request input), so it lands via set.
    const trashed = await Folder.create({ name: 'Gone' }, { set: { deletedAt: Date.now() } })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.patch('/folders/99999', { name: 'X' }).assertNotFound()
    await browser.patch(`/folders/${trashed.id}`, { name: 'X' }).assertNotFound()
  })

  it('rejects an unknown destination parent with 422', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const folder = await Folder.create({ name: 'A' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser.patch(`/folders/${folder.id}`, { parentId: 99999 }).assertUnprocessable()
  })
})
