/** Image bytes over `storage.disk()` (PLANNING.md §10, IMAGE_PIPELINE.md §7).
 *  Every object key is built here and nowhere else; callers only pass keys that
 *  came from a DB row or this class. The bucket's public domain serves these
 *  keys directly (task 6.3); the app keeps only a private preview route for the
 *  local disk.
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

/** Trashed objects live under this prefix (task 6.3): a bucket served directly
 *  by its files domain must stop answering the original key, and Cloudflare can
 *  block `/trash/*` with one rule. */
export const TRASH_PREFIX = 'trash/'

/** Where a hidden object lives; idempotent, so a retry never nests prefixes. */
export function trashObjectKey(key: string): string {
  return key.startsWith(TRASH_PREFIX) ? key : `${TRASH_PREFIX}${key}`
}

/** The original key of a (possibly hidden) object. */
export function liveObjectKey(key: string): string {
  return key.startsWith(TRASH_PREFIX) ? key.slice(TRASH_PREFIX.length) : key
}

/** Both object keys of one version, in a stable order. */
export function versionKeys(publicId: string, ref: VersionRef): string[] {
  return [imageKey(publicId, ref.version, ref.ext), thumbKey(publicId, ref.version)]
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

  /** Write both objects of one version. DB failures after this are the caller's
   *  cleanup problem (§7: delete the orphaned objects). Content-Type travels
   *  with the object; `Cache-Control` cannot (no such field on Guren's S3
   *  PutOptions), so the files domain sets it with a Cloudflare cache rule
   *  (task 6.3, docs/IMAGE_PIPELINE.md §6). */
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
   *  objects first, then rows — a storage failure must leave the rows). A
   *  trashed version lives under `trash/`, so both keys are removed; deleting a
   *  missing key is a no-op. */
  async deleteVersionObjects(refs: VersionRef[], publicId: string): Promise<number> {
    if (refs.length === 0) return 0
    return this.disk.deleteMany(
      refs.flatMap((ref) => versionKeys(publicId, ref).flatMap((key) => [key, trashObjectKey(key)])),
    )
  }

  /** Move every object of these versions under `trash/` (task 6.3). Resolves
   *  the live keys actually moved, so a caller whose DB write then fails can
   *  put exactly those back. Objects already hidden are skipped; a failure
   *  halfway undoes what it moved, so an image is never half-hidden. */
  async hideVersions(refs: VersionRef[], publicId: string): Promise<string[]> {
    const moved: string[] = []
    try {
      for (const key of refs.flatMap((ref) => versionKeys(publicId, ref))) {
        const live = liveObjectKey(key)
        if (await this.disk.exists(live)) {
          await this.disk.move(live, trashObjectKey(live))
          moved.push(live)
        }
        else if (!(await this.disk.exists(trashObjectKey(live)))) {
          throw new Error(`Cannot hide ${live}: the object is missing.`)
        }
      }
    }
    catch (error) {
      await this.restoreVersions(moved).catch(() => undefined)
      throw error
    }
    return moved
  }

  /** Put hidden objects back at their live keys. Missing objects on both sides
   *  throw, so a restore never reports success with a broken image; a partial
   *  failure re-hides what it moved. */
  async restoreVersions(keys: string[]): Promise<void> {
    const restored: string[] = []
    try {
      for (const key of keys) {
        const live = liveObjectKey(key)
        const hidden = trashObjectKey(live)
        if (await this.disk.exists(hidden)) {
          await this.disk.move(hidden, live)
          restored.push(live)
        }
        else if (!(await this.disk.exists(live))) {
          throw new Error(`Cannot restore ${live}: the object is missing.`)
        }
      }
    }
    catch (error) {
      for (const live of [...restored].reverse()) {
        await this.disk.move(live, trashObjectKey(live)).catch(() => undefined)
      }
      throw error
    }
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
