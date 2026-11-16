/** Image mutations that never touch stored bytes (ROUTES_SPEC §4): renaming
 *  updates `name` and the cosmetic `slug` but not `current_version`, so every
 *  permanent link keeps resolving — the lookup matches on `publicId` only and
 *  ignores the `{slug}` segment (PLANNING.md §7).
 */
import { ValidationException } from '@guren/core'
import { Image, type ImageRecord } from '../Models/Image.js'
import { toSlug } from './Slug.js'

export async function renameImage(image: ImageRecord, name: string): Promise<ImageRecord> {
  const siblings = await Image.where({ folderId: image.folderId }).whereNull('deletedAt').get()
  if (siblings.some((sibling) => sibling.id !== image.id && sibling.name.toLowerCase() === name.toLowerCase())) {
    throw ValidationException.withMessages({ name: ['An image with this name already exists.'] })
  }
  if (name === image.name) return image

  // `name` and `slug` are request data (fillable); `updatedAt` is server-chosen.
  await Image.update({ id: image.id }, { name, slug: toSlug(name) }, { set: { updatedAt: new Date().toISOString() } })
  const refreshed = await Image.find(image.id)
  if (!refreshed) throw new Error(`Image ${image.id} disappeared during rename`)
  return refreshed
}
