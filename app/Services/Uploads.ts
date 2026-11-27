/** The upload pipeline's storage + DB half (docs/IMAGE_PIPELINE.md §7):
 *  convert (done by ImageConverter) → write both objects → one transaction that
 *  lands the `images` row and version 1 (upload) or version n+1 (replace). A DB
 *  failure after the object writes must delete the orphaned objects before
 *  rethrowing, so the drive never shows a broken image and the bucket never
 *  keeps bytes nobody references. Replace then prunes beyond `KEEP_VERSIONS`.
 */
import type { ImageSettings } from '../../config/images.js'
import { Image, type ImageRecord } from '../Models/Image.js'
import { ImageVersion, type ImageVersionRecord } from '../Models/ImageVersion.js'
import { convert, type OutputChoice } from './ImageConverter.js'
import { uniqueName } from './NamePolicy.js'
import { ImageStore, newPublicId } from './ImageStore.js'
import { toSlug } from './Slug.js'

export interface UploadOptions {
  format?: OutputChoice
  quality?: number
  maxDimension?: number | null
  name?: string
}

export interface UploadSavings {
  originalSize: number
  storedSize: number
  savedBytes: number
  savedPercent: number
}

export interface StoredUpload {
  image: ImageRecord
  version: ImageVersionRecord
  saved: UploadSavings
}

/** Strip path separators and control characters from a client-supplied name
 *  (security checklist). The extension stays: the display name keeps it, the
 *  URL uses the stored `ext`, never this. */
function displayName(originalName: string, override?: string): string {
  const candidate = (override ?? originalName).replaceAll(/[/\\]/g, '').replaceAll(/\p{Cc}/gu, '').trim()
  return candidate.length > 0 ? candidate.slice(0, 255) : 'image'
}

/** Active siblings are uniquely named case-insensitively (PLANNING.md §6);
 *  automatic creates suffix a clash ` (1)`. One query covers every probe. */
async function freeName(candidate: string, folderId: number | null): Promise<string> {
  const siblings = await Image.where({ folderId }).whereNull('deletedAt').get()
  const taken = new Set(siblings.map((sibling) => sibling.name.toLowerCase()))
  return uniqueName(candidate, (name) => Promise.resolve(taken.has(name.toLowerCase())))
}

export async function storeUpload(input: {
  bytes: Buffer
  originalName: string
  folderId: number | null
  options: UploadOptions
  settings: ImageSettings
}): Promise<StoredUpload> {
  const converted = await convert(input.bytes, {
    format: input.options.format,
    quality: input.options.quality,
    maxDimension: input.options.maxDimension ?? null,
    settings: input.settings,
  })

  const name = await freeName(displayName(input.originalName, input.options.name), input.folderId)
  const publicId = newPublicId()

  // Objects first (§7): a failure here leaves no rows to clean up.
  const store = ImageStore.fromContainer()
  const keys = await store.putVersion({
    publicId,
    version: 1,
    ext: converted.ext,
    mime: converted.mime,
    image: converted.image,
    thumb: converted.thumb,
  })

  try {
    const convertOptions: UploadOptions = {
      format: input.options.format,
      quality: input.options.quality,
      maxDimension: input.options.maxDimension ?? null,
    }
    const rows = await Image.transaction(async (trx, txImage) => {
      // folderId is request input (fillable); publicId and the version number
      // are server-chosen and stay in `set`.
      const image = await txImage.create(
        { name, slug: toSlug(name), folderId: input.folderId, currentVersion: 1 },
        { set: { publicId } },
      )
      const version = await ImageVersion.inTransaction(trx).create({
        format: converted.format,
        mime: converted.mime,
        ext: converted.ext,
        size: converted.size,
        width: converted.width,
        height: converted.height,
        sha256: converted.sha256,
        storageKey: keys.storageKey,
        thumbKey: keys.thumbKey,
        originalName: displayName(input.originalName),
        originalFormat: converted.inputFormat,
        originalSize: converted.originalSize,
        convertOptions: JSON.stringify(convertOptions),
      }, { set: { imageId: image.id, version: 1 } })
      return { image, version }
    })

    return {
      image: rows.image,
      version: rows.version,
      saved: {
        originalSize: converted.originalSize,
        storedSize: converted.storedSize,
        savedBytes: converted.savedBytes,
        savedPercent: converted.savedPercent,
      },
    }
  }
  catch (error) {
    // §7: never leave orphans — the objects were written, the rows were not.
    await store.deleteVersionObjects([{ version: 1, ext: converted.ext }], publicId)
    throw error
  }
}

/** Replace = upload's pipeline with version n+1 over the same `publicId`.
 *  The version row and the `current_version` pointer land in one transaction,
 *  so a failed flip never leaves the image pointing at missing bytes. Old
 *  versions keep their objects; pruning beyond `KEEP_VERSIONS` is best effort
 *  and never removes the current version.
 */
export async function replaceImage(input: {
  image: ImageRecord
  bytes: Buffer
  originalName: string
  options: UploadOptions
  settings: ImageSettings
}): Promise<StoredUpload> {
  const converted = await convert(input.bytes, {
    format: input.options.format,
    quality: input.options.quality,
    maxDimension: input.options.maxDimension ?? null,
    settings: input.settings,
  })

  const { publicId } = input.image
  const version = input.image.currentVersion + 1
  const store = ImageStore.fromContainer()
  const keys = await store.putVersion({
    publicId,
    version,
    ext: converted.ext,
    mime: converted.mime,
    image: converted.image,
    thumb: converted.thumb,
  })

  let rows: { image: ImageRecord, version: ImageVersionRecord }
  try {
    const convertOptions: UploadOptions = {
      format: input.options.format,
      quality: input.options.quality,
      maxDimension: input.options.maxDimension ?? null,
    }
    rows = await Image.transaction(async (trx) => {
      const row = await ImageVersion.inTransaction(trx).create({
        format: converted.format,
        mime: converted.mime,
        ext: converted.ext,
        size: converted.size,
        width: converted.width,
        height: converted.height,
        sha256: converted.sha256,
        storageKey: keys.storageKey,
        thumbKey: keys.thumbKey,
        originalName: displayName(input.originalName),
        originalFormat: converted.inputFormat,
        originalSize: converted.originalSize,
        convertOptions: JSON.stringify(convertOptions),
      }, { set: { imageId: input.image.id, version } })

      await Image.where({ id: input.image.id }).forceUpdate({ currentVersion: version, updatedAt: new Date().toISOString() })
      const image = await Image.find(input.image.id)
      if (!image) throw new Error(`Image ${input.image.id} disappeared during replace`)
      return { image, version: row }
    })
  }
  catch (error) {
    await store.deleteVersionObjects([{ version, ext: converted.ext }], publicId)
    throw error
  }

  await pruneOldVersions(input.image.id, publicId, version, input.settings.keepVersions, store)

  return {
    image: rows.image,
    version: rows.version,
    saved: {
      originalSize: converted.originalSize,
      storedSize: converted.storedSize,
      savedBytes: converted.savedBytes,
      savedPercent: converted.savedPercent,
    },
  }
}

/** §7 step 5: objects first, then rows; never the current version. A prune
 *  failure must not fail the replace that already succeeded, so it is logged. */
async function pruneOldVersions(
  imageId: number,
  publicId: string,
  currentVersion: number,
  keep: number,
  store: ImageStore,
): Promise<void> {
  const versions = await ImageVersion.where({ imageId }).get()
  try {
    const pruned = await store.pruneVersions({
      publicId,
      currentVersion,
      keep,
      versions: versions.map((row) => ({ version: row.version, ext: row.ext })),
    })
    if (pruned.length === 0) return
    await Image.transaction(async () => {
      for (const ref of pruned) await ImageVersion.where({ imageId, version: ref.version }).delete()
    })
  }
  catch (error) {
    console.warn(`Pruning image ${imageId} failed; older versions were left in place.`, error)
  }
}
