/** Trash, restore and permanent delete (ROUTES_SPEC §4, PLANNING.md §6, tasks
 *  4.2 and 6.3). Trashing is a soft delete in the database, but the bytes move
 *  under the `trash/` key prefix at the same time: a files domain that serves
 *  the bucket directly must stop answering the live key at once. Restoring
 *  moves them back; permanent delete removes both locations. A trashed folder
 *  hides its whole subtree and moves its images' objects too.
 */
import { ValidationException } from '@guren/core'
import { Folder, type FolderRecord } from '../Models/Folder.js'
import { Image, type ImageRecord } from '../Models/Image.js'
import { ImageVersion, type ImageVersionRecord } from '../Models/ImageVersion.js'
import { ImageStore, versionKeys, type VersionRef } from './ImageStore.js'
import { uniqueName } from './NamePolicy.js'
import { toSlug } from './Slug.js'

export interface TrashInput {
  imageIds: readonly number[]
  folderIds: readonly number[]
}

export interface TrashResult {
  /** Items this request moved to the trash (already-trashed ones are no-ops). */
  trashed: number
  restored: number
  /** Rows permanently removed by `items.delete`. */
  deleted?: number
}

const MAX_DEPTH = 200

function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)]
}

/** Every folder below `roots`, roots included (a trashed folder hides its
 *  whole subtree). Walking up from each folder needs no children index. */
function withDescendants(roots: Iterable<number>, folders: FolderRecord[]): Set<number> {
  const direct = new Set(roots)
  const hidden = new Set(direct)
  const parentOf = new Map<number, number | null>(folders.map((row) => [row.id, row.parentId]))
  for (const folder of folders) {
    let cursor = folder.parentId
    for (let depth = 0; cursor !== null && depth < MAX_DEPTH; depth++) {
      if (direct.has(cursor)) {
        hidden.add(folder.id)
        break
      }
      cursor = parentOf.get(cursor) ?? null
    }
  }
  return hidden
}

/** The ids of every trashed folder: one recursive walk down the tree, so an
 *  image whose ancestor is trashed counts as hidden. Small tables make this
 *  cheaper than a CTE round trip. */
async function trashedFolderIds(): Promise<Set<number>> {
  const folders = await Folder.all()
  return withDescendants(folders.filter((row) => row.deletedAt !== null).map((row) => row.id), folders)
}

/** Both tables and the visible-image set in one read. Visibility decides which
 *  objects move: the bucket follows hidden → visible transitions, not the rows
 *  this request happened to name. */
interface VisibilitySnapshot {
  folders: FolderRecord[]
  images: ImageRecord[]
  visibleImages: Set<number>
}

async function visibilitySnapshot(): Promise<VisibilitySnapshot> {
  const [folders, images] = await Promise.all([Folder.all(), Image.all()])
  const hidden = withDescendants(
    folders.filter((row) => row.deletedAt !== null).map((row) => row.id),
    folders,
  )
  return {
    folders,
    images,
    visibleImages: new Set(images.filter((image) => isVisibleImage(image, hidden)).map((image) => image.id)),
  }
}

/** An image is visible when it is not itself trashed and no ancestor is. */
export function isVisibleImage(image: ImageRecord, hiddenFolders: ReadonlySet<number>): boolean {
  if (image.deletedAt !== null) return false
  return image.folderId === null || !hiddenFolders.has(image.folderId)
}

/** Active items, rejecting a batch that names anything unknown or already
 *  trashed — a trash request is all-or-nothing so a partial batch never leaves
 *  half of a selection in the Trash. */
async function resolveActive(input: TrashInput): Promise<{ images: ImageRecord[], folders: FolderRecord[] }> {
  const imageIds = uniqueIds(input.imageIds)
  const folderIds = uniqueIds(input.folderIds)
  if (imageIds.length + folderIds.length === 0) {
    throw ValidationException.withMessages({ items: ['Select at least one item.'] })
  }
  if (imageIds.length + folderIds.length > 500) {
    throw ValidationException.withMessages({ items: ['Handle at most 500 items at a time.'] })
  }
  const images = imageIds.length > 0 ? await Image.whereIn('id', imageIds).whereNull('deletedAt').get() : []
  const folders = folderIds.length > 0 ? await Folder.whereIn('id', folderIds).whereNull('deletedAt').get() : []
  if (images.length !== imageIds.length || folders.length !== folderIds.length) {
    throw ValidationException.withMessages({ items: ['Some of the selected items no longer exist.'] })
  }
  return { images, folders }
}

export async function trashItems(
  input: TrashInput,
  store: ImageStore = ImageStore.fromContainer(),
): Promise<TrashResult> {
  const { images, folders } = await resolveActive(input)
  const before = await visibilitySnapshot()
  const doomedFolders = withDescendants(folders.map((folder) => folder.id), before.folders)
  const requestedImages = new Set(images.map((image) => image.id))

  // Every image that this request makes invisible loses its objects from the
  // live keys: the clicked ones and everything inside a trashed folder.
  const toHide = before.images.filter((image) =>
    before.visibleImages.has(image.id) &&
    (requestedImages.has(image.id) || (image.folderId !== null && doomedFolders.has(image.folderId))),
  )

  const hidden: string[][] = []
  try {
    for (const image of toHide) {
      const refs = await versionRefsFor(image.id)
      hidden.push(await store.hideVersions(refs, image.publicId))
    }
  }
  catch (error) {
    // Objects moved, rows not yet: put them back so the image stays usable.
    await undoObjectMoves(store, hidden)
    throw error
  }

  const deletedAt = new Date().toISOString()
  // Both loops run in one transaction: the Trash either gains the whole batch
  // or none of it. `forceUpdate` is the query builder's trusted-server-data
  // path (the ORM types `deleted_at` out of the create payload), and the
  // builder joins the open transaction on its own.
  try {
    await Image.transaction(async () => {
      for (const image of images) {
        await Image.where({ id: image.id }).forceUpdate({ deletedAt })
      }
      for (const folder of folders) {
        await Folder.where({ id: folder.id }).forceUpdate({ deletedAt })
      }
    })
  }
  catch (error) {
    await undoObjectMoves(store, hidden)
    throw error
  }
  return { trashed: images.length + folders.length, restored: 0 }
}

/** Reverse the object half of a trash whose row write failed. */
async function undoObjectMoves(store: ImageStore, hidden: string[][]): Promise<void> {
  for (const keys of [...hidden].reverse()) await store.restoreVersions(keys)
}

async function versionRefsFor(imageId: number): Promise<VersionRef[]> {
  const versions = await ImageVersion.where({ imageId }).get()
  return versions.map(toVersionRef)
}

export async function restoreItems(
  input: TrashInput,
  store: ImageStore = ImageStore.fromContainer(),
): Promise<TrashResult> {
  const imageIds = uniqueIds(input.imageIds)
  const folderIds = uniqueIds(input.folderIds)
  if (imageIds.length + folderIds.length === 0) {
    throw ValidationException.withMessages({ items: ['Select at least one item.'] })
  }

  const images = imageIds.length > 0 ? await Image.whereIn('id', imageIds).whereNotNull('deletedAt').get() : []
  const folders = folderIds.length > 0 ? await Folder.whereIn('id', folderIds).whereNotNull('deletedAt').get() : []
  if (images.length !== imageIds.length || folders.length !== folderIds.length) {
    throw ValidationException.withMessages({ items: ['Only items in the Trash can be restored.'] })
  }

  const before = await visibilitySnapshot()
  let restored = 0
  await Image.transaction(async () => {
    for (const image of images) {
      const folderId = await visibleParent(image.folderId)
      const name = await freeImageName(image.name, folderId, [image.id])
      await Image.where({ id: image.id }).forceUpdate({ folderId, name, slug: toSlug(name), deletedAt: null })
      restored++
    }
    for (const folder of folders) {
      const parentId = await visibleParent(folder.parentId)
      const name = await freeFolderName(folder.name, parentId, [folder.id])
      await Folder.where({ id: folder.id }).forceUpdate({ parentId, name, deletedAt: null })
      restored++
    }
  })

  // Whatever became visible again gets its objects back at the live keys. This
  // runs after the rows so the pass sees the final folder tree (a restored
  // folder may bring descendants that this request never named).
  const after = await visibilitySnapshot()
  const toShow = after.images.filter((image) =>
    after.visibleImages.has(image.id) && !before.visibleImages.has(image.id),
  )
  for (const image of toShow) {
    const refs = await versionRefsFor(image.id)
    try {
      await store.restoreVersions(refs.flatMap((ref) => versionKeys(image.publicId, ref)))
    }
    catch (error) {
      // Keep the image hidden so a retry can finish: re-hide a half-restored
      // version set and put the row back in the Trash.
      await store.hideVersions(refs, image.publicId).catch(() => undefined)
      await Image.where({ id: image.id }).forceUpdate({ deletedAt: new Date().toISOString() })
      throw error
    }
  }
  return { trashed: 0, restored }
}

/** A parent that is missing or trashed cannot receive a restored item: it goes
 *  to the root instead (PLANNING.md §6). */
async function visibleParent(parentId: number | null): Promise<number | null> {
  if (parentId === null) return null
  const parent = await Folder.find(parentId)
  if (!parent || parent.deletedAt !== null) return null
  return parentId
}

async function freeImageName(name: string, folderId: number | null, exclude: number[]): Promise<string> {
  const siblings = await Image.where({ folderId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.filter((row) => !exclude.includes(row.id)).map((row) => row.name.toLowerCase()))
  return uniqueName(name, (candidate) => Promise.resolve(taken.has(candidate.toLowerCase())))
}

async function freeFolderName(name: string, parentId: number | null, exclude: number[]): Promise<string> {
  const siblings = await Folder.where({ parentId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.filter((row) => !exclude.includes(row.id)).map((row) => row.name.toLowerCase()))
  return uniqueName(name, (candidate) => Promise.resolve(taken.has(candidate.toLowerCase())))
}

/** Permanent delete (ROUTES_SPEC §4): only items already in the Trash. Objects
 *  of every version go first; if storage fails, the rows stay and the request
 *  throws, so a retry can finish the job. */
export async function deleteForever(input: TrashInput, store: ImageStore = ImageStore.fromContainer()): Promise<TrashResult> {
  const imageIds = uniqueIds(input.imageIds)
  const folderIds = uniqueIds(input.folderIds)
  if (imageIds.length + folderIds.length === 0) {
    throw ValidationException.withMessages({ items: ['Select at least one item.'] })
  }

  const images = imageIds.length > 0 ? await Image.whereIn('id', imageIds).whereNotNull('deletedAt').get() : []
  const folders = folderIds.length > 0 ? await Folder.whereIn('id', folderIds).whereNotNull('deletedAt').get() : []
  if (images.length !== imageIds.length || folders.length !== folderIds.length) {
    throw ValidationException.withMessages({ items: ['Only items in the Trash can be deleted forever.'] })
  }

  // A trashed folder takes its whole subtree with it: trashing a folder hides
  // its contents (PLANNING.md §6), so the images and subfolders underneath are
  // only reachable through it and must go too — FK order forces images first.
  const allFolders = await Folder.all()
  const subtree = new Set(folders.map((folder) => folder.id))
  let grown = true
  while (grown) {
    grown = false
    for (const folder of allFolders) {
      if (folder.parentId !== null && subtree.has(folder.parentId) && !subtree.has(folder.id)) {
        subtree.add(folder.id)
        grown = true
      }
    }
  }
  const allImages = await Image.all()
  const doomedImages = new Map<number, ImageRecord>()
  for (const image of images) doomedImages.set(image.id, image)
  for (const image of allImages) {
    if (image.folderId !== null && subtree.has(image.folderId)) doomedImages.set(image.id, image)
  }
  const doomedFolders = allFolders.filter((folder) => subtree.has(folder.id))

  // Objects first: every version's image and thumb, per image. This happens
  // before any row is touched, so a storage failure leaves the rows in place.
  for (const image of doomedImages.values()) {
    const versions = await ImageVersion.where({ imageId: image.id }).get()
    await store.deleteVersionObjects(versions.map(toVersionRef), image.publicId)
  }

  // Images before folders: `images.folder_id` and `image_versions.image_id`
  // are foreign keys, so a folder can only be removed once nothing points at it.
  await Image.transaction(async () => {
    for (const image of doomedImages.values()) {
      await ImageVersion.where({ imageId: image.id }).delete()
      await Image.where({ id: image.id }).delete()
    }
    // Deepest folder first, so a child never blocks its parent.
    for (const folder of [...doomedFolders].sort((a, b) => depthOf(b, allFolders) - depthOf(a, allFolders))) {
      await Folder.where({ id: folder.id }).delete()
    }
  })
  return { trashed: 0, restored: 0, deleted: doomedImages.size + doomedFolders.length }
}

/** How far a folder sits below the root: the delete order needs children first
 *  so no parent is removed while a live child still references it. */
function depthOf(folder: FolderRecord, all: FolderRecord[]): number {
  const byId = new Map(all.map((row) => [row.id, row]))
  let depth = 0
  let cursor = folder.parentId
  while (cursor !== null && depth < 200) {
    depth++
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return depth
}

function toVersionRef(version: ImageVersionRecord) {
  return { version: version.version, ext: version.ext }
}

/** Empty the Trash (ROUTES_SPEC §4, `DELETE /trash`): every trashed image and
 *  folder goes through the same permanent-delete path, so objects and rows are
 *  removed exactly as "Delete forever" removes them. */
export async function emptyTrash(store: ImageStore = ImageStore.fromContainer()): Promise<TrashResult> {
  const images = await Image.whereNotNull('deletedAt').get()
  const folders = await Folder.whereNotNull('deletedAt').get()
  if (images.length + folders.length === 0) return { trashed: 0, restored: 0, deleted: 0 }
  return deleteForever(
    { imageIds: images.map((image) => image.id), folderIds: folders.map((folder) => folder.id) },
    store,
  )
}

export { trashedFolderIds }
