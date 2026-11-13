/** Image bytes over `storage.disk()` (PLANNING.md §10, IMAGE_PIPELINE.md §7).
 *  Every object key is built here and nowhere else; controllers and callers
 *  only ever pass keys that came from a DB row or from this class. The bucket
 *  stays private: reading happens through the app's public routes (task 1.3).
 */
import { ambientContainer, type StorageDriver, type StorageManager } from '@guren/core'

/** `images/{publicId}/v{version}.{ext}` (§4). Opaque on purpose: the display
 *  name lives in the DB, so renames never touch objects. */
export function imageKey(publicId: string, version: number, ext: string): string {
  return `images/${publicId}/v${version}.${ext}`
}

/** `images/{publicId}/v{version}.thumb.webp` (§4). Thumbs are always WebP. */
export function thumbKey(publicId: string, version: number): string {
  return `images/${publicId}/v${version}.thumb.webp`
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const PUBLIC_ID_LENGTH = 12

/** 12 chars of base62 from crypto.getRandomValues (§4): unique, unguessable
 *  (about 71 bits), never reused. The DB UNIQUE column is the backstop. */
export function newPublicId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PUBLIC_ID_LENGTH))
  return Array.from(bytes, (byte) => BASE62[byte % BASE62.length]).join('')
}

export interface VersionObjects {
  publicId: string
  version: number
  ext: string
  mime: string
  image: Buffer
  thumb: Buffer
}

/** A stored version row's identity, as prune needs it. */
export interface VersionRef {
  version: number
  ext: string
}

export interface StoredKeys {
  storageKey: string
  thumbKey: string
}

export class ImageStore {
  constructor(private readonly disk: StorageDriver) {}

  /** The configured disk of the booted app (tests may pin their own). */
  static fromContainer(): ImageStore {
    const storage = ambientContainer()?.make<StorageManager>('storage')
    if (!storage) throw new Error('Storage is not available: the application has not booted.')
    return new ImageStore(storage.disk())
  }

  /** Write both objects of one version. Pure DB failures after this are the
   *  caller's cleanup problem (§7: delete the orphaned objects). */
  async putVersion(input: VersionObjects): Promise<StoredKeys> {
    const storageKey = imageKey(input.publicId, input.version, input.ext)
    const thumb = thumbKey(input.publicId, input.version)
    await Promise.all([
      this.disk.put(storageKey, input.image, { contentType: input.mime }),
      this.disk.put(thumb, input.thumb, { contentType: 'image/webp' }),
    ])
    return { storageKey, thumbKey: thumb }
  }

  async readImage(storageKey: string): Promise<Buffer | null> {
    return this.disk.get(storageKey)
  }

  async readThumb(thumbKey: string): Promise<Buffer | null> {
    return this.disk.get(thumbKey)
  }

  /** Delete both objects of the given version rows (permanent delete, §7:
   *  objects first, then rows — a storage failure must leave the rows). */
  async deleteVersionObjects(refs: VersionRef[], publicId: string): Promise<number> {
    if (refs.length === 0) return 0
    return this.disk.deleteMany(
      refs.map((ref) => [imageKey(publicId, ref.version, ref.ext), thumbKey(publicId, ref.version)]).flat(),
    )
  }

  /** Keep the newest `keep` versions plus the current one (§4), oldest pruned
   *  first; objects are deleted here, the caller deletes the rows. Never
   *  touches the current version, so pinned URLs of a "restore older" survive. */
  async pruneVersions(input: {
    publicId: string
    currentVersion: number
    keep: number
    versions: VersionRef[]
  }): Promise<VersionRef[]> {
    const sorted = [...input.versions].sort((a, b) => a.version - b.version)
    const others = sorted.filter((ref) => ref.version !== input.currentVersion)
    // keep-1: the current version always holds one of the slots.
    const survivors = input.keep > 1 ? new Set(others.slice(-(input.keep - 1)).map((ref) => ref.version)) : new Set<number>()
    const pruned = others.filter((ref) => !survivors.has(ref.version))
    if (pruned.length > 0) await this.deleteVersionObjects(pruned, input.publicId)
    return pruned
  }
}
