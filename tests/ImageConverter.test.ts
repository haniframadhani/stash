import { describe, expect, it } from 'bun:test'
import sharp from 'sharp'
import {
  DEFAULT_IMAGE_SETTINGS,
  Semaphore,
  convert,
  type ConvertOptions,
} from '../app/Services/ImageConverter.js'
import { capabilities } from '../app/Services/ImageCapabilities.js'
import {
  AnimatedFormatError,
  FormatUnavailableError,
  ImageTooLargeError,
  PixelCapExceededError,
  UnsupportedInputError,
} from '../app/Services/ImageErrors.js'
import type { ImageSettings } from '../config/images.js'

// Fixtures are generated with sharp at run time — no binary fixtures committed
// (AGENTS.md). Pure unit tests: no storage, no DB (IMAGE_PIPELINE.md §3).

const settings = (over: Partial<ImageSettings> = {}): ImageSettings => ({
  ...DEFAULT_IMAGE_SETTINGS,
  ...over,
})

const convertJpeg = async (options: Partial<ConvertOptions> = {}, size = { width: 400, height: 250 }) =>
  convert(await jpeg(size.width, size.height), { format: 'webp', ...options })

function jpeg(width: number, height: number, background = 'red'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 90 }).toBuffer()
}

function png(width: number, height: number, background = 'green'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
}

function rawFrame(r: number, g: number, b: number): Buffer {
  return Buffer.from(Array.from({ length: 16 * 16 }, () => [r, g, b, 255]).flat())
}

async function animatedFrames(format: 'gif' | 'webp'): Promise<Buffer> {
  const [a, b] = await Promise.all([
    sharp(rawFrame(255, 0, 0), { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer(),
    sharp(rawFrame(0, 0, 255), { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer(),
  ])
  return sharp([a, b], { animated: true, join: { animated: true } }).toFormat(format).toBuffer()
}

/** sharp's withExif normalizes Orientation, so the EXIF APP1 segment is built
 *  by hand: one IFD entry, tag 274 (Orientation), SHORT, value = orientation. */
function exifSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(274, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(orientation, 18)
  tiff.writeUInt16LE(0, 20)
  tiff.writeUInt32LE(0, 22)
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2)
  return Buffer.concat([Buffer.from([0xFF, 0xE1]), length, payload])
}

async function jpegWithOrientation(width: number, height: number, orientation: number): Promise<Buffer> {
  const jpeg = await sharp({ create: { width, height, channels: 3, background: 'red' } })
    .jpeg({ quality: 90 })
    .toBuffer()
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(orientation), jpeg.subarray(2)])
}

const caps = await capabilities()

describe('ImageConverter', () => {
  describe('accepted formats', () => {
    it('converts jpeg to webp and reports savings', async () => {
      const original = await jpeg(400, 250)
      const result = await convert(original, { format: 'webp' })
      expect(result.format).toBe('webp')
      expect(result.mime).toBe('image/webp')
      expect(result.ext).toBe('webp')
      expect(result.width).toBe(400)
      expect(result.height).toBe(250)
      expect(result.size).toBe(result.image.length)
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(result.originalSize).toBe(original.length)
      expect(result.storedSize).toBeLessThan(original.length)
      expect(result.savedBytes).toBe(original.length - result.storedSize)
      expect(result.savedPercent).toBeGreaterThan(0)
    })

    it('converts png to avif', async () => {
      if (!caps.avif) return // skipped when sharp lacks AVIF on this platform
      const result = await convert(await png(200, 150), { format: 'avif' })
      expect(result.format).toBe('avif')
      expect(result.mime).toBe('image/avif')
      expect(result.ext).toBe('avif')
      expect(result.width).toBe(200)
      expect(result.height).toBe(150)
    })

    it('keeps the sniffed bytes unchanged for "original" and saves nothing', async () => {
      const original = await jpeg(64, 48)
      const result = await convert(original, { format: 'original' })
      expect(result.format).toBe('jpeg')
      expect(result.mime).toBe('image/jpeg')
      expect(result.ext).toBe('jpg')
      expect(result.image.equals(original)).toBe(true)
      expect(result.savedBytes).toBe(0)
      expect(result.savedPercent).toBe(0)
      // The thumbnail is still produced for the grid.
      expect(result.thumb.length).toBeGreaterThan(0)
    })
  })

  describe('rejected inputs', () => {
    it('rejects svg with 415', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')
      const error = await convert(svg, { format: 'webp' }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(UnsupportedInputError)
      expect((error as UnsupportedInputError).status).toBe(415)
    })

    it('rejects tiff with 415', async () => {
      const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } })
        .tiff()
        .toBuffer()
      const error = await convert(tiff, { format: 'webp' }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(UnsupportedInputError)
      expect((error as UnsupportedInputError).status).toBe(415)
    })

    it('rejects text and corrupt buffers with 415', async () => {
      const error = await convert(Buffer.from('this is not an image at all'), { format: 'webp' }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(UnsupportedInputError)
      expect((error as UnsupportedInputError).status).toBe(415)
      // HEIC/HEIF is rejected the same way: sharp sniffs it as 'heif', which is
      // not in the accepted list; a real HEIC cannot be fabricated here because
      // sharp cannot encode it.
    })
  })

  describe('caps', () => {
    it('rejects oversized input with 413 before parsing', async () => {
      const error = await convertJpeg({ settings: settings({ maxUploadBytes: 100 }) }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(ImageTooLargeError)
      expect((error as ImageTooLargeError).status).toBe(413)
    })

    it('rejects a pixel bomb with 422', async () => {
      const error = await convertJpeg({
        settings: settings({ maxPixels: 100 }),
        capabilities: { webp: true, avif: true },
      }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(PixelCapExceededError)
      expect((error as PixelCapExceededError).status).toBe(422)
    })

    it('rejects a quality outside 1–100 with 422', async () => {
      const error = await convertJpeg({ quality: 0 }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as { status?: number }).status).toBe(422)
    })

    it('rejects an unavailable format with 422', async () => {
      const error = await convertJpeg({ format: 'avif', capabilities: { webp: true, avif: false } }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(FormatUnavailableError)
      expect((error as FormatUnavailableError).status).toBe(422)
    })
  })

  describe('resize and rotation', () => {
    it('resizes to fit maxDimension and never enlarges', async () => {
      const shrunk = await convertJpeg({ maxDimension: 800 }, { width: 1600, height: 1000 })
      expect(shrunk.width).toBe(800)
      expect(shrunk.height).toBe(500)

      const untouched = await convertJpeg({ maxDimension: 800 }, { width: 400, height: 250 })
      expect(untouched.width).toBe(400)
      expect(untouched.height).toBe(250)
    })

    it('auto-rotates from EXIF orientation before encoding', async () => {
      // Orientation 6: decode-time 90° CW rotation, 100×200 portrait → landscape.
      const result = await convert(await jpegWithOrientation(100, 200, 6), { format: 'webp' })
      expect(result.width).toBe(200)
      expect(result.height).toBe(100)
    })

    it('strips EXIF/GPS metadata from the stored bytes', async () => {
      const oriented = await jpegWithOrientation(100, 200, 6)
      expect(oriented.includes(Buffer.from('Exif', 'ascii'))).toBe(true)
      const result = await convert(oriented, { format: 'webp' })
      expect(result.image.includes(Buffer.from('Exif', 'ascii'))).toBe(false)
      expect(result.image.includes(Buffer.from('EXIF', 'ascii'))).toBe(false)
    })
  })

  describe('animation', () => {
    it('keeps animation for animated gif → animated webp', async () => {
      const result = await convert(await animatedFrames('gif'), { format: 'webp' })
      expect(result.isAnimated).toBe(true)
      expect(result.width).toBe(16)
      expect(result.height).toBe(16) // page dims, not the sum over frames
      const output = await sharp(result.image, { animated: true }).metadata()
      expect(output.pages).toBeGreaterThanOrEqual(2)
    })

    it('keeps animation for animated webp input', async () => {
      const result = await convert(await animatedFrames('webp'), { format: 'webp' })
      expect(result.isAnimated).toBe(true)
      const output = await sharp(result.image, { animated: true }).metadata()
      expect(output.pages).toBeGreaterThanOrEqual(2)
    })

    it('rejects avif for animated input with 422', async () => {
      // sharp 0.35.5 encodes animated AVIF without error but flattens it to one
      // frame, so the server rejects the combination instead (IMAGE_PIPELINE §2).
      const error = await convert(await animatedFrames('gif'), {
        format: 'avif',
        capabilities: { webp: true, avif: true },
      }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(AnimatedFormatError)
      expect((error as AnimatedFormatError).status).toBe(422)
    })
  })

  describe('thumbnail', () => {
    it('builds a ≤320px webp thumb from the first frame only', async () => {
      const result = await convertJpeg({}, { width: 1000, height: 600 })
      const thumb = await sharp(result.thumb).metadata()
      expect(thumb.format).toBe('webp')
      expect(thumb.width).toBeLessThanOrEqual(320)
      expect(thumb.pages ?? 1).toBe(1)

      const animated = await convert(await animatedFrames('gif'), { format: 'webp' })
      const animatedThumb = await sharp(animated.thumb, { animated: true }).metadata()
      expect(animatedThumb.pages ?? 1).toBe(1)
    })
  })

  describe('Semaphore', () => {
    it('serializes work beyond the limit', async () => {
      const semaphore = new Semaphore(1)
      let running = 0
      let peak = 0
      const job = async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 10))
        running--
      }
      await Promise.all([semaphore.run(job), semaphore.run(job), semaphore.run(job)])
      expect(peak).toBe(1)
    })
  })
})
