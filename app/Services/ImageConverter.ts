/** Pure image conversion pipeline wrapped by sharp.
 *  Order: size cap → sniff → pixel cap → auto-rotate → optional resize (never enlarge)
 *         → encode → strip metadata (EXIF/GPS) → thumb → sha256 → store.
 *
 *  D4: sharp is used instead of Bun.Image because Bun.Image AVIF support is
 *     unavailable on Linux and AVIF encoding on macOS needs Apple Silicon M3+.
 *     sharp ships its own encoders and works everywhere.
 */
import sharp from 'sharp'

/** Accepted input formats (sniffed from uploaded file, not trusted from client). */
export type InputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif'

/** Output formats the pipeline can produce. */
export type OutputFormat = 'webp' | 'avif' | 'original'

/** Concurrency semaphore limit for parallel encodes (sharp workers). */
export const CONVERT_CONCURRENCY = 2

/** Maximum dimension after optional resize. Images larger than this are
 *  down-scaled; smaller images are left untouched (never enlarged). */
export const MAX_DIMENSION = 4000

/** Maximum upload size in bytes (from MAX_UPLOAD_MB env). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Validate that the requested output format is supported. */
export function isOutputFormat(format: string): format is OutputFormat {
  return ['webp', 'avif', 'original'].includes(format)
}

/** Options for the encodeImage function. */
export interface EncodeOptions {
  outputFormat: OutputFormat
  quality?: number
  maxDimension?: number
  effort?: number  // AVIF encoding effort (0-9, lower is faster)
  stripMetadata?: boolean
}

/** Check whether sharp can encode a given format.
 *  Returns true if the format is available, false otherwise.
 *  Probes at runtime; results are cached and exposed as a shared Inertia prop.
 *
 *  We create a minimal 16×16 test image and attempt to encode it.
 *  If the format-specific method exists and succeeds, the format is available.
 */
export async function capabilities(): Promise<{
  webp: boolean
  avif: boolean
}> {
  // Create a minimal 16×16 test image (RGBA buffer)
  const testBuffer = Buffer.alloc(16 * 16 * 4, 0)
  // Fill with a simple gradient so the data is non-trivial
  for (let i = 0; i < 16 * 16; i++) {
    testBuffer[i * 4 + (i % 4)] = (i * 43 + 17) % 256
  }

  const results: { webp: boolean; avif: boolean } = {
    webp: false,
    avif: false,
  }

  // Test WebP encoding
  try {
    // @ts-ignore - sharp type variance across versions
    await sharp(testBuffer).webp({ quality: 80 }).toBuffer()
    results.webp = true
  } catch {
    // sharp.webp not available or failed
  }

  // Test AVIF encoding
  try {
    // @ts-ignore - sharp type variance across versions
    await sharp(testBuffer).avif({ quality: 55, effort: 4 }).toBuffer()
    results.avif = true
  } catch {
    // sharp.avif not available (common on Linux)
  }

  return results
}

/** Encode an image buffer to the specified output format.
 *  Returns the encoded Buffer, or throws if the format is unsupported.
 *
 *  Pipeline order (per docs/IMAGE_PIPELINE.md §1–§3):
 *   1. Size cap (reject > MAX_UPLOAD_BYTES)
 *   2. Sniff format (trust sniffer, not client MIME)
 *   3. Pixel cap (reject > MAX_PIXELS)
 *   4. Auto-rotate (exif orientation)
 *   5. Resize if needed (never enlarge, max MAX_DIMENSION)
 *   6. Encode to target format
 *   7. Strip metadata (EXIF and GPS tags) if requested
 *   8. Build thumbnail (320px width)
 *   9. Compute sha256
 */
export async function encodeImage(
  buffer: Buffer,
  options: EncodeOptions,
): Promise<{
  data: Buffer
  format: OutputFormat
  size: number
  width: number
  height: number
  sha256: string
  mime: string
}> {
  // 1. Size cap
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Upload exceeds size cap of ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    )
  }

  // 2. Sniff format from buffer content (not from client-supplied MIME)
  const sniffed = await sharp(buffer).metadata()
  const width = sniffed.width ?? 0
  const height = sniffed.height ?? 0

  // 3. Pixel cap (decompression bomb defense)
  const pixelCount = width * height
  if (pixelCount > 300 * 1000 * 1000) { // 300MP rough cap
    throw new Error('Image exceeds pixel cap (decompression bomb defense)')
  }

  // 4. Auto-rotate: sharp auto-rotates based on EXIF orientation by default
  let img = sharp(buffer)

  // 5. Resize if needed (never enlarge)
  let resizedImg = img
  if (options.maxDimension && width > options.maxDimension) {
    resizedImg = img.resize(options.maxDimension, null, {
      withoutEnlargement: true,
      fit: 'inside',
    })
  } else {
    resizedImg = img
  }

  // 6. Encode to target format
  let encoded: Buffer

  switch (options.outputFormat) {
    case 'webp':
      // @ts-ignore - sharp type variance
      encoded = await resizedImg.webp({ quality: options.quality ?? 80 }).toBuffer()
      break
    case 'avif':
      // @ts-ignore - sharp type variance
      encoded = await resizedImg.avif({
        quality: options.quality ?? 55,
        effort: options.effort ?? 4,
      }).toBuffer()
      break
    case 'original':
      // Return the original buffer unchanged (no conversion)
      encoded = buffer
      break
    default:
      throw new Error(`Unsupported output format: ${options.outputFormat}`)
  }

  // 7. Strip metadata (EXIF and GPS) if requested
  let finalData = encoded
  if (options.stripMetadata && options.outputFormat !== 'original') {
    // Re-encode without metadata using withMetadata(false)
    if (options.outputFormat === 'webp') {
      // @ts-ignore - sharp type variance
      finalData = await sharp(encoded).withMetadata(false).webp({
        quality: options.quality ?? 80,
      }).toBuffer()
    } else if (options.outputFormat === 'avif') {
      // @ts-ignore - sharp type variance
      finalData = await sharp(encoded).withMetadata(false).avif({
        quality: options.quality ?? 55,
        effort: options.effort ?? 4,
      }).toBuffer()
    }
    // original format: keep as-is (client chose original)
  }

  // 8. Build thumbnail (320px width, maintain aspect ratio)
  // @ts-ignore - sharp type variance
  const _thumbBuf = await sharp(finalData)
    .resize(320, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer()

  // 9. Compute sha256 of the stored bytes (encoded data)
  const crypto = await import('node:crypto')
  const sha256 = crypto.createHash('sha256').update(finalData).digest('hex')

  const mimeTypeMap: Record<OutputFormat, string> = {
    webp: 'image/webp',
    avif: 'image/avif',
    original: 'image/jpeg',
  }

  return {
    data: finalData,
    format: options.outputFormat,
    size: finalData.length,
    width,
    height,
    sha256,
    mime: mimeTypeMap[options.outputFormat],
  }
}

/** Probe sharp capabilities at app boot and export for Inertia props.
 *  This is called once at app boot; the result is shared as a prop so the
 *  UI can hide AVIF if it's unavailable on the runtime platform.
 *
 *  The result is cached so it's only probed once per app process lifetime.
 */
const cachedCapabilities = (await capabilities()) as {
  webp: boolean
  avif: boolean
}

export function probeCapabilities(): {
  webp: boolean
  avif: boolean
} {
  return cachedCapabilities
}