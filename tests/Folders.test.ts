import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import { ValidationException } from '@guren/core'
import app from '../src/app.js'
import { resetDatabase } from '../config/database.js'
import { Folder, type FolderRecord } from '../app/Models/Folder.js'
import {
  breadcrumbsFor,
  createFolder,
  updateFolder,
} from '../app/Services/Folders.js'

/** A → B → C chain of active folders; the cycle cases move one of them into
 *  itself, its child, or a deep descendant. */
async function seedChain(): Promise<{ a: FolderRecord, b: FolderRecord, c: FolderRecord }> {
  const a = await Folder.create({ name: 'A' })
  const b = await Folder.create({ name: 'B', parentId: a.id })
  const c = await Folder.create({ name: 'C', parentId: b.id })
  return { a, b, c }
}

/** Task 2.1: cycle rejection (self, child, deep descendant), the sibling-name
 *  policy on create, and the breadcrumb chain. The suite boots the app so the
 *  models have their database, like the controller tests do. */
/** Cycle and clash rejections arrive as ValidationException with field errors
 *  (422 over HTTP); the HTTP tests assert the status, these read the shape. */
function validationErrorFor(run: () => Promise<unknown>): Promise<ValidationException> {
  return run().then(
    () => { throw new Error('expected the call to reject') },
    (error: unknown) => {
      if (!(error instanceof ValidationException)) throw error
      return error
    },
  )
}

describe('Folders service', () => {
  // Boots the app so the models have their database, like the controller
  // tests do; the TestApp itself is unused here — only the boot matters.
  beforeAll(async () => {
    await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('rejects moving a folder into itself', async () => {
    const { a } = await seedChain()
    const error = await validationErrorFor(() => updateFolder(a, { parentId: a.id }))
    expect(error.errors?.parentId?.[0]).toContain('CYCLE')
  })

  it('rejects moving a folder into its direct child', async () => {
    const { a, b } = await seedChain()
    const error = await validationErrorFor(() => updateFolder(a, { parentId: b.id }))
    expect(error.errors?.parentId?.[0]).toContain('CYCLE')
  })

  it('rejects moving a folder into a deep descendant', async () => {
    const { a, c } = await seedChain()
    const error = await validationErrorFor(() => updateFolder(a, { parentId: c.id }))
    expect(error.errors?.parentId?.[0]).toContain('CYCLE')
  })

  it('allows moving a folder into its own ancestor without creating a cycle', async () => {
    const { a, b, c } = await seedChain()
    const moved = await updateFolder(c, { parentId: a.id })
    expect(moved.parentId).toBe(a.id)
    // B keeps its parent; nothing in the chain loops.
    expect((await Folder.find(b.id))?.parentId).toBe(a.id)
  })

  it('moves a folder to the root with an explicit null parent', async () => {
    const { c } = await seedChain()
    const moved = await updateFolder(c, { parentId: null })
    expect(moved.parentId).toBeNull()
  })

  it('suffixes a sibling clash on create as ` (1)`', async () => {
    const { a } = await seedChain()
    const first = await createFolder({ name: 'Trips', parentId: a.id })
    const second = await createFolder({ name: 'Trips', parentId: a.id })
    expect(first.name).toBe('Trips')
    expect(second.name).toBe('Trips (1)')
    expect(second.parentId).toBe(a.id)
  })

  it('rejects an explicit rename onto an existing sibling name', async () => {
    const { a } = await seedChain()
    await createFolder({ name: 'Trips', parentId: a.id })
    const other = await createFolder({ name: 'Other', parentId: a.id })
    const error = await validationErrorFor(() => updateFolder(other, { name: 'Trips' }))
    expect(error.errors?.name?.[0]).toContain('already exists')
  })

  it('renames when no sibling carries the name (case-insensitive check)', async () => {
    const { b } = await seedChain()
    const renamed = await updateFolder(b, { name: 'B' })
    expect(renamed.name).toBe('B')
  })

  it('rejects an unknown or trashed parent', async () => {
    const trashed = await Folder.create({ name: 'Gone' }, { set: { deletedAt: Date.now() } })
    const unknown = await validationErrorFor(() => createFolder({ name: 'X', parentId: trashed.id }))
    expect(unknown.errors?.parentId?.[0]).toContain('does not exist')
    await validationErrorFor(() => createFolder({ name: 'X', parentId: 99999 }))
    const live = await createFolder({ name: 'Live', parentId: null })
    await validationErrorFor(() => updateFolder(live, { parentId: 99999 }))
  })

  it('builds breadcrumbs root-first from the ancestor chain', async () => {
    const { c } = await seedChain()
    const crumbs = await breadcrumbsFor(c)
    expect(crumbs).toEqual([
      { id: null, name: 'My Files' },
      { id: crumbs[1]!.id, name: 'A' },
      { id: crumbs[2]!.id, name: 'B' },
      { id: c.id, name: 'C' },
    ])
  })

  it('builds a single crumb for a root folder', async () => {
    const { a } = await seedChain()
    expect(await breadcrumbsFor(a)).toEqual([
      { id: null, name: 'My Files' },
      { id: a.id, name: 'A' },
    ])
  })
})
