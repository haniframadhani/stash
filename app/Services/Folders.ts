/** Folder create/rename/move and breadcrumb building (ROUTES_SPEC §4, task 2.1).
 *  Names follow the sibling policy (PLANNING.md §6): active siblings are unique
 *  case-insensitively — automatic creates suffix a clash ` (1)` via NamePolicy,
 *  explicit renames onto an existing name are a validation error. Moving a
 *  folder into itself or one of its descendants is rejected (CYCLE) by walking
 *  the ancestor chain, which covers self, child and deep descendants alike.
 */
import { ValidationException } from '@guren/core'
import { Folder, type FolderRecord } from '../Models/Folder.js'
import { uniqueName } from './NamePolicy.js'

export type Crumb = { id: number | null, name: string }

/** Bound for the walk up the ancestor chain; a corrupt parent chain must not
 *  hang a request. A real drive never nests 200 folders deep. */
const MAX_DEPTH = 200

/** A ` (1)`-suffix auto-name keeps creating friction-free; an explicit rename
 *  onto an existing sibling name stays an error. */
export async function createFolder(input: { name: string, parentId: number | null }): Promise<FolderRecord> {
  // resolveParent throws on an unknown or trashed destination; the row itself
  // is only needed for that guarantee.
  await resolveParent(input.parentId)
  const name = await freeName(input.name, input.parentId)
  return Folder.create({ name, parentId: input.parentId })
}

export async function updateFolder(
  folder: FolderRecord,
  input: { name?: string, parentId?: number | null },
): Promise<FolderRecord> {
  if (input.parentId !== undefined) {
    if (input.parentId === folder.id) {
      throw ValidationException.withMessages({ parentId: ['A folder cannot be moved into itself (CYCLE).'] })
    }
    await resolveParent(input.parentId)
    await assertNotDescendant(folder.id, input.parentId)
    // `parentId` is request data (fillable); `updatedAt` is server-chosen and
    // goes through `set`.
    await Folder.update({ id: folder.id }, { parentId: input.parentId }, { set: { updatedAt: new Date().toISOString() } })
  }
  if (input.name !== undefined) {
    const clash = await Folder.where({ parentId: folder.parentId }).whereNull('deletedAt').get()
    if (clash.some((sibling) => sibling.id !== folder.id && sibling.name.toLowerCase() === input.name!.toLowerCase())) {
      throw ValidationException.withMessages({ name: ['A folder with this name already exists.'] })
    }
    if (input.name !== folder.name) {
      await Folder.update({ id: folder.id }, { name: input.name }, { set: { updatedAt: new Date().toISOString() } })
    }
  }
  const refreshed = await Folder.find(folder.id)
  if (!refreshed) throw new Error(`Folder ${folder.id} disappeared during update`)
  return refreshed
}

/** Breadcrumbs root-first, per ROUTES_SPEC §3: `id: null` is "My Files". A
 *  broken or cyclic ancestor chain (impossible through the API, defensive in
 *  the data) stops the walk instead of hanging it. */
export async function breadcrumbsFor(folder: FolderRecord): Promise<Crumb[]> {
  const chain: Crumb[] = [{ id: folder.id, name: folder.name }]
  let cursor = folder.parentId
  for (let depth = 0; cursor !== null && depth < MAX_DEPTH; depth++) {
    const row: FolderRecord | null = await Folder.find(cursor)
    if (!row) break
    chain.unshift({ id: row.id, name: row.name })
    cursor = row.parentId
  }
  return [{ id: null, name: 'My Files' }, ...chain]
}

/** The new parent chain must never reach back to `folderId`: walking up from
 *  the target parent covers self, a child, and any deep descendant in one loop.
 *  `field` names the failing input, so a bulk move can report it on
 *  `targetFolderId` while folders.update reports it on `parentId`. */
export async function assertNotDescendant(
  folderId: number,
  newParentId: number | null,
  field = 'parentId',
): Promise<void> {
  let cursor = newParentId
  for (let depth = 0; cursor !== null && depth < MAX_DEPTH; depth++) {
    if (cursor === folderId) {
      throw ValidationException.withMessages({ [field]: ['A folder cannot be moved into one of its subfolders (CYCLE).'] })
    }
    const row: FolderRecord | null = await Folder.find(cursor)
    if (!row) return
    cursor = row.parentId
  }
}

/** Unknown or trashed parents are request errors (422), not 404s: the id
 *  arrives in the body, not the URL. */
async function resolveParent(parentId: number | null): Promise<FolderRecord | null> {
  if (parentId === null) return null
  const parent = await Folder.find(parentId)
  if (!parent || parent.deletedAt !== null) {
    throw ValidationException.withMessages({ parentId: ['The destination folder does not exist.'] })
  }
  return parent
}

async function freeName(candidate: string, parentId: number | null): Promise<string> {
  const siblings = await Folder.where({ parentId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.map((sibling) => sibling.name.toLowerCase()))
  return uniqueName(candidate, (name) => Promise.resolve(taken.has(name.toLowerCase())))
}
