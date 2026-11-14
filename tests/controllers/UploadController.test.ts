import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import sharp from 'sharp'
import { MemoryStorageDriver, StorageManager } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'
import { Image } from '../../app/Models/Image.js'
import { ImageVersion } from '../../app/Models/ImageVersion.js'

// `POST /uploads` (TASKS 1.4, docs/IMAGE_PIPELINE.md §7 to §8): the full
// convert → objects → transaction slice. The disk is a plain memory driver so
// the orphan-cleanup assertions read the real written keys.

let http: TestApp
let disposer: Disposable | undefined
let disk: MemoryStorageDriver

beforeAll(async () => {
  http = await TestApp.fromApp(app)
  disk = new MemoryStorageDriver({})
  const manager = new StorageManager({ default: 'memory' })
  manager.registerDisk('memory', () => disk)
  disposer = app.container.fake('storage', manager)
})

afterAll(() => {
  disposer?.[Symbol.dispose]()
})

beforeEach(async () => {
  await resetDatabase()
  disk.clear()
})

function jpegBytes(width = 320, height = 200, background = 'red'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 90 }).toBuffer()
}

function uploadForm(file: File, fields: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.append('file', file, file.name)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

/** `Buffer` is a `Uint8Array` with a growable buffer; `File` wants a plain
 *  `ArrayBuffer` view, so copy the bytes. */
function fileFrom(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

const owner = () => User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

/** A TestApp signed in as a fresh user with a primed CSRF token. */
async function signedIn(): Promise<TestApp> {
  return await http.actingAs(await owner()).withCsrf()
}

describe('uploads.store', () => {
  it('converts a JPEG to version 1 webp, writes both objects and lands one row each', async () => {
    const bytes = await jpegBytes()
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(bytes, 'sunset.jpg', 'image/jpeg')))
      .assertCreated()

    const body = await response.json<{
      image: {
        publicId: string, name: string, version: number, format: string, slug: string,
        size: number, urls: { thumb: string, latest: string },
      }
      originalSize: number
      storedSize: number
      savedBytes: number
      savedPercent: number
    }>()

    expect(body.image.name).toBe('sunset.jpg')
    expect(body.image.version).toBe(1)
    expect(body.image.format).toBe('webp')
    expect(body.originalSize).toBe(bytes.length)
    expect(body.storedSize).toBe(body.image.size)
    expect(body.savedBytes).toBe(bytes.length - body.storedSize)
    expect(body.savedPercent).toBeGreaterThan(0)
    expect(body.image.urls.thumb).toContain(`/t/${body.image.publicId}/`)
    expect(body.image.urls.thumb.endsWith('.v1.webp')).toBe(true)

    const images = await Image.all()
    const versions = await ImageVersion.all()
    expect(images).toHaveLength(1)
    expect(versions).toHaveLength(1)

    const [image] = images
    const [version] = versions
    expect(image.publicId).toBe(body.image.publicId)
    expect(image.currentVersion).toBe(1)
    expect(image.folderId).toBeNull()
    expect(version.imageId).toBe(image.id)
    expect(version.version).toBe(1)
    expect(version.storageKey).toBe(`images/${image.publicId}/v1.webp`)
    expect(version.thumbKey).toBe(`images/${image.publicId}/v1.thumb.webp`)
    expect(version.originalFormat).toBe('jpeg')
    expect(version.originalSize).toBe(bytes.length)
    expect(await disk.exists(version.storageKey)).toBe(true)
    expect(await disk.exists(version.thumbKey)).toBe(true)
    // Nothing else was written to the disk.
    expect(disk.getAllPaths()).toHaveLength(2)
  })

  it('strips path separators and control characters from the file name', async () => {
    const bytes = await jpegBytes()
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(bytes, '../../etc/pass\u0000wd.jpg', 'image/jpeg')))
      .assertCreated()

    const body = await response.json<{ image: { name: string } }>()
    expect(body.image.name.includes('/')).toBe(false)
    expect(body.image.name).not.toContain('\u0000')
  })

  it('suffixes a second upload with the same name ` (1)`', async () => {    const client = await signedIn()
    const bytes = await jpegBytes()
    const file = fileFrom(bytes, 'photo.jpg', 'image/jpeg')
    await client.post('/uploads', uploadForm(file)).assertCreated()
    await client.post('/uploads', uploadForm(file)).assertCreated()

    const names = (await Image.all()).map((image) => image.name).sort()
    expect(names).toEqual(['photo.jpg', 'photo.jpg (1)'])
  })

  it('deletes the objects when the DB write fails after they were stored', async () => {
    const bytes = await jpegBytes()
    // A folderId no folder owns trips the FK constraint inside the transaction —
    // the objects are already on the disk at that point (§7).
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(bytes, 'sunset.jpg', 'image/jpeg'), { folderId: '999999' }))

    expect(response.status).toBe(500)
    expect(disk.getAllPaths()).toEqual([])
    expect(await Image.all()).toHaveLength(0)
    expect(await ImageVersion.all()).toHaveLength(0)
  })

  it('answers 413 for an oversized file before parsing anything', async () => {
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(Buffer.alloc(50 * 1024 * 1024 + 1), 'big.bin', 'application/octet-stream')))

    response.assertStatus(413)
    expect((await response.json<{ message: string }>()).message).toContain('upload cap')
    expect(disk.getAllPaths()).toEqual([])
  })

  it('answers 415 for bytes that sniff as no accepted format', async () => {
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(Buffer.from('this is not an image'), 'note.txt', 'text/plain')))

    response.assertStatus(415)
    expect((await response.json<{ message: string }>()).message).toContain('Not an accepted image')
    expect(disk.getAllPaths()).toEqual([])
  })

  it('answers 422 for an invalid option', async () => {
    const bytes = await jpegBytes()
    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(bytes, 'sunset.jpg', 'image/jpeg'), { quality: '0' }))

    response.assertUnprocessable()
    expect(await response.json<{ errors: Record<string, string[]> }>())
      .toHaveProperty('errors.quality')
    expect(disk.getAllPaths()).toEqual([])
  })

  it('answers 422 for AVIF on an animated input (the animation would be lost)', async () => {
    const frame = (r: number, g: number, b: number) =>
      sharp(Buffer.from(Array.from({ length: 8 * 8 }, () => [r, g, b, 255]).flat()), {
        raw: { width: 8, height: 8, channels: 4 },
      }).png().toBuffer()
    const [a, b] = await Promise.all([frame(255, 0, 0), frame(0, 0, 255)])
    const gif = await sharp([a, b], { animated: true, join: { animated: true } }).gif().toBuffer()

    const response = await (await signedIn())
      .post('/uploads', uploadForm(fileFrom(gif, 'blink.gif', 'image/gif'), { format: 'avif' }))

    response.assertStatus(422)
    expect((await response.json<{ message: string }>()).message).toContain('animated')
    expect(disk.getAllPaths()).toEqual([])
  })

  it('answers 422 when no file is attached', async () => {
    const response = await (await signedIn()).post('/uploads', uploadForm(new File([], '')))
    response.assertUnprocessable()
    const body = await response.json<{ errors: Record<string, string[]> }>()
    expect(body.errors.file).toBeDefined()
  })

  it('rejects an unauthenticated upload', async () => {
    const bytes = await jpegBytes()
    const response = await http.post('/uploads', uploadForm(fileFrom(bytes, 'sunset.jpg', 'image/jpeg')))
    expect([401, 403, 302]).toContain(response.status)
    expect(await Image.all()).toHaveLength(0)
  })
})
