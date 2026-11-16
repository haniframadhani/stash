/** Bulk move (ROUTES_SPEC §4, task 2.4): one atomic request moves a set of
 *  images and folders into a target folder (or the root). Everything is checked
 *  before the transaction starts, so a CYCLE, an unknown item or a name clash
 *  leaves every row where it was. `(publicId, version)` is untouched by a move;
 *  only `folder_id` / `parent_id` and `updated_at` change.
 */
import { ValidationException } from '@guren/core'
import { Folder, type FolderRecord } from '../Models/Folder.js'
import { Image, type ImageRecord } from '../Models/Image.js'
import { assertNotDescendant } from './Folders.js'

export interface MoveInput {
  imageIds: readonly number[]
  folderIds: readonly number[]
  targetFolderId: number | null
}

export interface MoveResult {
  /** Items that actually changed folder (items already there are no-ops). */
  imageCount: number
  folderCount: number
  /** Where the first moved item came from: the redirect lands back there. */
  fromFolderId: number | null
}

/** A move is all-or-nothing: every folder cycle and every name clash is found
 *  before the first row is written, and the writes share one transaction. */
export async function moveItems(input: MoveInput): Promise<MoveResult> {
  const imageIds = uniqueIds(input.imageIds)
  const folderIds = uniqueIds(input.folderIds)
  if (imageIds.length + folderIds.length === 0) {
    throw ValidationException.withMessages({ items: ['Select at least one item to move.'] })
  }

  const targetFolderId = input.targetFolderId
  await resolveTarget(targetFolderId)

  const images = imageIds.length > 0
    ? await Image.whereIn('id', imageIds).whereNull('deletedAt').get()
    : []
  if (images.length !== imageIds.length) {
    throw ValidationException.withMessages({ items: ['Some of the selected items no longer exist.'] })
  }
  const folders = folderIds.length > 0
    ? await Folder.whereIn('id', folderIds).whereNull('deletedAt').get()
    : []
  if (folders.length !== folderIds.length) {
    throw ValidationException.withMessages({ items: ['Some of the selected items no longer exist.'] })
  }

  // Keep the request order: the redirect names the source of the first item
  // the user dragged, not whatever order the database returned.
  const orderedImages = orderById(images, imageIds)
  const orderedFolders = orderById(folders, folderIds)

  for (const folder of orderedFolders) {
    if (folder.id === targetFolderId) {
      throw ValidationException.withMessages({ targetFolderId: ['A folder cannot be moved into itself (CYCLE).'] })
    }
    // Covers a child and any deeper descendant in one ancestor walk.
    await assertNotDescendant(folder.id, targetFolderId, 'targetFolderId')
  }

  const movingImages = orderedImages.filter((image) => image.folderId !== targetFolderId)
  const movingFolders = orderedFolders.filter((folder) => folder.parentId !== targetFolderId)
  await assertNoImageClash(movingImages, targetFolderId)
  await assertNoFolderClash(movingFolders, targetFolderId)

  if (movingImages.length + movingFolders.length > 0) {
    const updatedAt = new Date().toISOString()
    await Image.transaction(async (trx) => {
      for (const image of movingImages) {
        await Image.inTransaction(trx).update(
          { id: image.id },
          { folderId: targetFolderId },
          { set: { updatedAt } },
        )
      }
      for (const folder of movingFolders) {
        await Folder.inTransaction(trx).update(
          { id: folder.id },
          { parentId: targetFolderId },
          { set: { updatedAt } },
        )
      }
    })
  }

  const firstImage: ImageRecord | undefined = orderedImages[0]
  const firstFolder: FolderRecord | undefined = orderedFolders[0]
  const fromFolderId = firstImage
    ? firstImage.folderId
    : firstFolder
      ? firstFolder.parentId
      : targetFolderId

  return {
    imageCount: movingImages.length,
    folderCount: movingFolders.length,
    fromFolderId,
  }
}

function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)]
}

function orderById<T extends { id: number }>(rows: T[], ids: readonly number[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row === undefined ? [] : [row]
  })
}

/** Unknown or trashed destinations are request errors (422), like folders.update:
 *  the id arrives in the body, not the URL. */
async function resolveTarget(targetFolderId: number | null): Promise<FolderRecord | null> {
  if (targetFolderId === null) return null
  const target = await Folder.find(targetFolderId)
  if (!target || target.deletedAt !== null) {
    throw ValidationException.withMessages({ targetFolderId: ['The destination folder does not exist.'] })
  }
  return target
}

/** A move is a rename-less relocation: two active siblings may not share a
 *  name, so a clash is rejected rather than silently suffixed. The moved rows
 *  themselves are not siblings yet and are excluded from the taken set. */
async function assertNoImageClash(images: ImageRecord[], targetFolderId: number | null): Promise<void> {
  if (images.length === 0) return
  const moving = new Set(images.map((image) => image.id))
  const siblings = await Image.where({ folderId: targetFolderId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.filter((sibling) => !moving.has(sibling.id)).map((sibling) => sibling.name.toLowerCase()))
  for (const image of images) {
    const key = image.name.toLowerCase()
    if (taken.has(key)) {
      throw ValidationException.withMessages({
        targetFolderId: [`An image named "${image.name}" already exists in the destination.`],
      })
    }
    taken.add(key)
  }
}

async function assertNoFolderClash(folders: FolderRecord[], targetFolderId: number | null): Promise<void> {
  if (folders.length === 0) return
  const moving = new Set(folders.map((folder) => folder.id))
  const siblings = await Folder.where({ parentId: targetFolderId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.filter((sibling) => !moving.has(sibling.id)).map((sibling) => sibling.name.toLowerCase()))
  for (const folder of folders) {
    const key = folder.name.toLowerCase()
    if (taken.has(key)) {
      throw ValidationException.withMessages({
        targetFolderId: [`A folder named "${folder.name}" already exists in the destination.`],
      })
    }
    taken.add(key)
  }
}
