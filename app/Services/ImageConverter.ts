/** Pure image conversion pipeline (docs/IMAGE_PIPELINE.md §1 to §3).
 *  Bytes in, bytes + metadata out — no storage, no DB, no request context.
 *  Order: size cap → sniff → pixel cap → auto-rotate → optional resize
 *  (never enlarge) → encode → strip metadata → thumb → sha256.
 */
import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import type { ImageSettings } from '../../config/images.js'
import { probeCapabilities, type Capabilities } from './ImageCapabilities.js'
import {
  AnimatedFormatError,
  FormatUnavailableError,
  ImageConversionError,
  ImageTooLargeError,
  PixelCapExceededError,
  UnsupportedInputError,
} from './ImageErrors.js'

/** Input formats accepted after sniffing the bytes (never the client MIME). */
export type InputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif'

/** Output choice from the Review & convert dialog. */
export type OutputChoice = 'webp' | 'avif' | 'original'

/** The format actually stored: `original` keeps the sniffed input format. */
export type StoredFormat = InputFormat

const ACCEPTED_INPUTS = new Set<InputFormat>(['jpeg', 'png', 'webp', 'avif', 'gif'])

const MIME: Record<InputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
}

const EXT: Record<InputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
}

/** Mirrors the config/env defaults. Production passes `container.make('images')`
 *  via `options.settings`; tests pass their own to exercise the caps. */
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  acceptedInputFormats: ['jpeg', 'png', 'webp', 'avif', 'gif'],
  outputFormats: ['webp', 'avif', 'original'],
  defaultFormat: 'webp',
  defaultQualityWebp: 80,
  defaultQualityAvif: 55,
  avifEffort: 4,
  maxUploadBytes: 50 * 1024 * 1024,
  maxPixels: 100_000_000,
  convertConcurrency: 2,
  keepVersions: 5,
  thumbWidth: 320,
  thumbQuality: 70,
}

/** Limits simultaneous encodes (CONVERT_CONCURRENCY, default 2); AVIF is slow,
 *  so parallel uploads must queue rather than compete for CPU. */
export class Semaphore {
  private active = 0
  private waiting: Array<() => void> = []

  constructor(public limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    }
    finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active++
        resolve()
      })
    })
  }

  private release(): void {
    this.active--
    this.waiting.shift()?.()
  }
}

const semaphore = new Semaphore(DEFAULT_IMAGE_SETTINGS.convertConcurrency)

export interface ConvertOptions {
  /** Output format. Default 'webp' (env DEFAULT_FORMAT). */
  format?: OutputChoice
  /** 1–100. Defaults to settings.defaultQualityWebp / defaultQualityAvif. */
  quality?: number
  /** Fit inside this square when the image is larger. Never enlarges. */
  maxDimension?: number | null
  /** Caps and thumb settings; defaults to DEFAULT_IMAGE_SETTINGS. */
  settings?: ImageSettings
  /** Override of the boot-time capability probe (tests). */
  capabilities?: Capabilities
}

export interface ConvertResult {
  /** Encoded bytes to store under `images/{publicId}/v{n}.{ext}`. */
  image: Buffer
  /** 320 px WebP thumbnail, first frame only. */
  thumb: Buffer
  format: StoredFormat
  /** The sniffed input format, kept for `image_versions.original_format`. */
  inputFormat: InputFormat
  mime: string
  ext: string
  /** Stored bytes. */
  size: number
  width: number
  height: number
  isAnimated: boolean
  sha256: string
  originalSize: number
  storedSize: number
  savedBytes: number
  savedPercent: number
}

/** Convert one image. Pure: reads only `input` and `options`, touches nothing else.
 *  Throws ImageConversionError subclasses whose `status` maps to 413/415/422. */
export async function convert(input: Buffer, options: ConvertOptions = {}): Promise<ConvertResult> {
  const settings = options.settings ?? DEFAULT_IMAGE_SETTINGS
  const choice = options.format ?? settings.defaultFormat

  // §3.1: size cap before any parsing.
  if (input.length > settings.maxUploadBytes) {
    throw new ImageTooLargeError(settings.maxUploadBytes)
  }

  if (options.quality !== undefined && (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100)) {
    throw new ImageConversionError('invalid_quality', 422, `quality must be an integer between 1 and 100, got ${options.quality}`)
  }

  semaphore.limit = settings.convertConcurrency
  return semaphore.run(async () => {
    // §3.2: sniff the bytes; a text/corrupt buffer throws, svg/tiff/heif sniff
    // as their own format and are rejected against the accepted list.
    // metadata() reads headers only — no decode, no pixel allocation — so the
    // limitInputPixels cap belongs to the decode pipeline below.
    let sniffed: Metadata
    try {
      sniffed = await sharp(input).metadata()
    }
    catch {
      throw new UnsupportedInputError()
    }
    const inputFormat = sniffed.format as InputFormat | undefined
    if (!inputFormat || !ACCEPTED_INPUTS.has(inputFormat)) {
      throw new UnsupportedInputError(inputFormat)
    }

    const isAnimated = (sniffed.pages ?? 1) > 1
    // §3.2: decode every frame for gif/webp so conversion keeps animation.
    const decodeAnimated = isAnimated && (inputFormat === 'gif' || inputFormat === 'webp')

    // Pixel cap over all decoded frames; with animated:true sharp reports the
    // height as the sum of every frame's height.
    const sourcePixels = decodeAnimated
      ? await sharp(input, { animated: true }).metadata()
      : sniffed
    if ((sourcePixels.width ?? 0) * (sourcePixels.height ?? 0) > settings.maxPixels) {
      throw new PixelCapExceededError(settings.maxPixels)
    }

    // 'original' stores the sniffed bytes unchanged: no rotate, no resize, no
    // re-encode — EXIF (GPS included) is kept, which the dialog must warn about.
    if (choice === 'original') {
      return finish(input, await makeThumb(input, settings), {
        format: inputFormat,
        inputFormat,
        width: sniffed.width ?? 0,
        height: sniffed.height ?? 0,
        isAnimated,
        originalSize: input.length,
      })
    }

    // §2: refuse a format sharp cannot encode (probed at boot) and refuse AVIF
    // for animated inputs (it would silently lose the animation).
    const caps = options.capabilities ?? await probeCapabilities()
    if (choice === 'webp' && !caps.webp) throw new FormatUnavailableError('webp')
    if (choice === 'avif' && !caps.avif) throw new FormatUnavailableError('avif')
    if (choice === 'avif' && isAnimated) throw new AnimatedFormatError()

    const quality = options.quality ?? (choice === 'avif' ? settings.defaultQualityAvif : settings.defaultQualityWebp)

    let pipeline = sharp(input, {
      limitInputPixels: settings.maxPixels,
      animated: decodeAnimated,
      // §3.3: auto-orient from EXIF first, so stripping metadata later cannot
      // flip the picture.
    }).rotate()
    // §3.4: fit inside the square when asked; withoutEnlargement keeps smaller
    // images untouched.
    if (options.maxDimension) {
      pipeline = pipeline.resize({
        width: options.maxDimension,
        height: options.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    // §3.5: encode. No `.withMetadata()` call — sharp drops EXIF/GPS/ICC extras
    // by default, so public images never leak location. A decode failure here
    // (e.g. a header that lied about its size, tripping limitInputPixels) is
    // the client's bad input, so it answers 422.
    let data: Buffer
    let info: { width: number, height: number, pages?: number }
    try {
      const encoded = choice === 'webp'
        ? await pipeline.webp({ quality }).toBuffer({ resolveWithObject: true })
        : await pipeline.avif({ quality, effort: settings.avifEffort }).toBuffer({ resolveWithObject: true })
      data = encoded.data
      info = encoded.info
    }
    catch (error) {
      throw new ImageConversionError(
        'conversion_failed',
        422,
        error instanceof Error ? `Could not decode or encode the image: ${error.message}` : 'Could not decode or encode the image',
      )
    }

    // For animated output sharp reports info.height as the sum over all frames;
    // the stored dimensions are the per-frame ones.
    const frames = decodeAnimated ? (info.pages ?? sniffed.pages ?? 1) : 1

    return finish(data, await makeThumb(data, settings), {
      format: choice,
      inputFormat,
      width: info.width,
      height: Math.round(info.height / frames),
      isAnimated,
      originalSize: input.length,
    })
  })
}

function finish(
  image: Buffer,
  thumb: Buffer,
  parts: { format: StoredFormat, inputFormat: InputFormat, width: number, height: number, isAnimated: boolean, originalSize: number },
): ConvertResult {
  const storedSize = image.length
  const savedBytes = parts.originalSize - storedSize
  return {
    image,
    thumb,
    format: parts.format,
    inputFormat: parts.inputFormat,
    mime: MIME[parts.format],
    ext: EXT[parts.format],
    size: storedSize,
    width: parts.width,
    height: parts.height,
    isAnimated: parts.isAnimated,
    sha256: createHash('sha256').update(image).digest('hex'),
    originalSize: parts.originalSize,
    storedSize,
    savedBytes,
    savedPercent: parts.originalSize > 0 ? Math.round((savedBytes / parts.originalSize) * 100) : 0,
  }
}

/** §3.6: 320 px wide WebP thumb, quality 70, first frame only (animated:false
 *  decodes page 1). Also carries no metadata. */
async function makeThumb(source: Buffer, settings: ImageSettings): Promise<Buffer> {
  return sharp(source, { animated: false, limitInputPixels: settings.maxPixels })
    .resize({ width: settings.thumbWidth, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: settings.thumbQuality })
    .toBuffer()
}
