/** The review-side pure logic (TASKS 1.6, UI_SPEC §3): client sniffing mirrors
 *  the server's accept list, animated detection drives the AVIF lockout, and
 *  remembered settings can never smuggle an invalid value into the dialog. */
import { describe, expect, it } from 'bun:test'
import {
  classifyReviewFiles,
  looksAnimated,
  sniffImageFormat,
  type SniffedFormat,
} from '../resources/js/lib/reviewFiles.js'
import { defaultQuality, parseUploadSettings } from '../resources/js/lib/uploadSettings.js'

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0))
const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

function fileOf(head: Uint8Array, name: string, type = 'application/octet-stream', pad = 0): File {
  // A fresh copy gives the Blob a plain ArrayBuffer, which TS 7 wants here.
  const data = new Uint8Array(head)
  const parts: BlobPart[] = [data]
  if (pad > 0) parts.push(new Uint8Array(pad))
  return new File(parts, name, { type })
}

const caps = { avif: true, maxUploadMb: 50 }

describe('sniffImageFormat', () => {
  const imageCases: Array<[SniffedFormat, Uint8Array]> = [
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0)],
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ['gif', ascii('GIF89a')],
    ['webp', ascii('RIFF....WEBPVP8 ')],
    ['avif', ascii('....ftypavif....')],
  ]
  for (const [format, head] of imageCases) {
    it(`accepts ${format}`, () => {
      expect(sniffImageFormat(head)).toEqual({ kind: 'image', format })
    })
  }

  it('rejects SVG from any leading markup or text', () => {
    expect(sniffImageFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({ kind: 'rejected', reason: 'svg' })
    expect(sniffImageFormat(ascii('<?xml version="1.0"?><svg/>'))).toEqual({ kind: 'rejected', reason: 'svg' })
    expect(sniffImageFormat(ascii('  \n <svg/>'))).toEqual({ kind: 'rejected', reason: 'svg' })
  })

  it('rejects HEIC/HEIF brands', () => {
    expect(sniffImageFormat(ascii('....ftypheic....'))).toEqual({ kind: 'rejected', reason: 'heic' })
    expect(sniffImageFormat(ascii('....ftypmif1....'))).toEqual({ kind: 'rejected', reason: 'heic' })
  })

  it('treats TIFF, BMP, MP4 and text as unknown', () => {
    expect(sniffImageFormat(ascii('II*\0'))).toEqual({ kind: 'unknown' })
    expect(sniffImageFormat(ascii('BM....'))).toEqual({ kind: 'unknown' })
    expect(sniffImageFormat(ascii('....ftypisom....'))).toEqual({ kind: 'unknown' })
    expect(sniffImageFormat(ascii('this is not an image'))).toEqual({ kind: 'unknown' })
    expect(sniffImageFormat(new Uint8Array(0))).toEqual({ kind: 'unknown' })
  })
})

describe('looksAnimated', () => {
  it('finds the NETSCAPE block of animated GIFs', () => {
    expect(looksAnimated('gif', ascii('GIF89a...NETSCAPE2.0...'))).toBe(true)
    expect(looksAnimated('gif', ascii('GIF89a plain frame'))).toBe(false)
  })
  it('finds ANMF in animated WebP', () => {
    expect(looksAnimated('webp', ascii('RIFF....WEBPVP8X...ANMF'))).toBe(true)
    expect(looksAnimated('webp', ascii('RIFF....WEBPVP8 '))).toBe(false)
  })
  it('finds acTL in APNG', () => {
    expect(looksAnimated('png', ascii('\x89PNG...acTL...IDAT'))).toBe(true)
    expect(looksAnimated('png', ascii('\x89PNG...IDAT'))).toBe(false)
  })
  it('JPEG and AVIF inputs are never animated by this check', () => {
    expect(looksAnimated('jpeg', ascii('NETSCAPE2.0'))).toBe(false)
    expect(looksAnimated('avif', ascii('ANMF'))).toBe(false)
  })
})

describe('classifyReviewFiles', () => {
  it('marks valid images and reads their animation flag', async () => {
    const rows = await classifyReviewFiles(
      [fileOf(bytes(0xff, 0xd8, 0xff, 0xe0), 'sunset.jpg', 'image/jpeg')],
      caps,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.valid).toBe(true)
    expect(rows[0]!.name).toBe('sunset.jpg')
    expect(rows[0]!.animated).toBe(false)
  })

  it('flags unsupported and unknown files without a format', async () => {
    const rows = await classifyReviewFiles(
      [
        fileOf(ascii('<svg/>'), 'logo.svg', 'image/svg+xml'),
        fileOf(ascii('....ftypheic....'), 'photo.heic', 'image/heic'),
        fileOf(ascii('hello'), 'note.txt', 'text/plain'),
      ],
      caps,
    )
    expect(rows.every((row) => !row.valid)).toBe(true)
    expect(rows[0]!.problem).toContain('SVG')
    expect(rows[1]!.problem).toContain('HEIC')
    expect(rows[2]!.problem).toContain('Not an image')
  })

  it('flags files over the size cap before reading their bytes', async () => {
    const rows = await classifyReviewFiles(
      [fileOf(bytes(0xff, 0xd8, 0xff, 0xe0), 'big.jpg', 'image/jpeg', 1.5 * 1024 * 1024)],
      { avif: true, maxUploadMb: 1 },
    )
    expect(rows[0]!.valid).toBe(false)
    expect(rows[0]!.problem).toContain('Larger than the 1 MB limit')
  })
})

describe('parseUploadSettings', () => {
  it('accepts a well-formed remembered choice', () => {
    expect(parseUploadSettings({ format: 'webp', quality: 80, maxDimension: 2048 }, caps)).toEqual({
      format: 'webp',
      quality: 80,
      maxDimension: 2048,
    })
    expect(parseUploadSettings({ format: 'original' }, caps)).toEqual({ format: 'original' })
  })

  it('rejects an AVIF choice when the server cannot encode AVIF', () => {
    expect(parseUploadSettings({ format: 'avif', quality: 55 }, { avif: false })).toBeNull()
    expect(parseUploadSettings({ format: 'avif', quality: 55 }, caps)).toEqual({ format: 'avif', quality: 55 })
  })

  it('rejects garbage instead of defaulting parts of it', () => {
    expect(parseUploadSettings(null, caps)).toBeNull()
    expect(parseUploadSettings('webp', caps)).toBeNull()
    expect(parseUploadSettings({ format: 'gif' }, caps)).toBeNull()
    expect(parseUploadSettings({ format: 'webp', quality: 0 }, caps)).toBeNull()
    expect(parseUploadSettings({ format: 'webp', quality: 101 }, caps)).toBeNull()
    expect(parseUploadSettings({ format: 'webp', maxDimension: 0 }, caps)).toBeNull()
  })
})

describe('defaultQuality', () => {
  it('picks the per-format default from the shared capabilities', () => {
    const capabilities = {
      webp: true,
      avif: true,
      maxUploadMb: 50,
      defaults: { format: 'webp' as const, qualityWebp: 80, qualityAvif: 55 },
    }
    expect(defaultQuality(capabilities, 'webp')).toBe(80)
    expect(defaultQuality(capabilities, 'avif')).toBe(55)
    expect(defaultQuality(capabilities, 'original')).toBe(80)
  })
})
