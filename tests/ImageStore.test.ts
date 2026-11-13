import { describe, expect, it } from 'bun:test'
import { StorageManager } from '@guren/core'
import { ImageStore, imageKey, newPublicId, thumbKey } from '../app/Services/ImageStore.js'

// Keys live only here (docs/IMAGE_PIPELINE.md §4); the contract with the disk
// itself is tests/storage-contract.test.ts.
function memoryStore(): ImageStore {
  return new ImageStore(new StorageManager({ default: 'memory', disks: { memory: { driver: 'memory' } } }).disk())
}

describe('ImageStore keys', () => {
  it('builds the documented key shapes', () => {
    expect(imageKey('Ab3xY9kQ2mZ1', 3, 'avif')).toBe('images/Ab3xY9kQ2mZ1/v3.avif')
    expect(thumbKey('Ab3xY9kQ2mZ1', 3)).toBe('images/Ab3xY9kQ2mZ1/v3.thumb.webp')
  })

  it('generates 12-char base62 public ids', () => {
    const id = newPublicId()
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/)
    const ids = new Set(Array.from({ length: 200 }, () => newPublicId()))
    expect(ids.size).toBe(200)
  })
})

describe('ImageStore on the memory disk', () => {
  it('writes and reads both objects of a version', async () => {
    const store = memoryStore()
    const image = Buffer.from('image-bytes')
    const thumb = Buffer.from('thumb-bytes')

    const keys = await store.putVersion({
      publicId: 'Ab3xY9kQ2mZ1', version: 1, ext: 'webp', mime: 'image/webp', image, thumb,
    })

    expect(keys.storageKey).toBe('images/Ab3xY9kQ2mZ1/v1.webp')
    expect(keys.thumbKey).toBe('images/Ab3xY9kQ2mZ1/v1.thumb.webp')
    expect(await store.readImage(keys.storageKey)).toEqual(image)
    expect(await store.readThumb(keys.thumbKey)).toEqual(thumb)
  })

  it('deletes every object of the given versions', async () => {
    const store = memoryStore()
    for (const version of [1, 2]) {
      await store.putVersion({
        publicId: 'Ab3xY9kQ2mZ1', version, ext: 'webp', mime: 'image/webp',
        image: Buffer.from(`v${version}`), thumb: Buffer.from(`t${version}`),
      })
    }
    const removed = await store.deleteVersionObjects(
      [{ version: 1, ext: 'webp' }, { version: 2, ext: 'webp' }],
      'Ab3xY9kQ2mZ1',
    )
    expect(removed).toBe(4)
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 1, 'webp'))).toBeNull()
    expect(await store.readThumb(thumbKey('Ab3xY9kQ2mZ1', 2))).toBeNull()
  })

  it('prunes oldest first and never the current version', async () => {
    const store = memoryStore()
    for (const version of [1, 2, 3, 4]) {
      await store.putVersion({
        publicId: 'Ab3xY9kQ2mZ1', version, ext: 'webp', mime: 'image/webp',
        image: Buffer.from(`v${version}`), thumb: Buffer.from(`t${version}`),
      })
    }

    const pruned = await store.pruneVersions({
      publicId: 'Ab3xY9kQ2mZ1', currentVersion: 4, keep: 2,
      versions: [1, 2, 3, 4].map((version) => ({ version, ext: 'webp' })),
    })

    expect(pruned).toEqual([{ version: 1, ext: 'webp' }, { version: 2, ext: 'webp' }])
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 1, 'webp'))).toBeNull()
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 2, 'webp'))).toBeNull()
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 3, 'webp'))).not.toBeNull()
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 4, 'webp'))).not.toBeNull()
  })

  it('prunes everything but the current version when keep is 1', async () => {
    const store = memoryStore()
    for (const version of [1, 2, 3]) {
      await store.putVersion({
        publicId: 'Ab3xY9kQ2mZ1', version, ext: 'png', mime: 'image/png',
        image: Buffer.from(`v${version}`), thumb: Buffer.from(`t${version}`),
      })
    }
    const pruned = await store.pruneVersions({
      publicId: 'Ab3xY9kQ2mZ1', currentVersion: 2, keep: 1,
      versions: [1, 2, 3].map((version) => ({ version, ext: 'png' })),
    })
    expect(pruned.map((ref) => ref.version).sort()).toEqual([1, 3])
    expect(await store.readImage(imageKey('Ab3xY9kQ2mZ1', 2, 'png'))).not.toBeNull()
  })
})
