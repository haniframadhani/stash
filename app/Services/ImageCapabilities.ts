/** Boot-time probe of which formats sharp can encode in this build
 *  (IMAGE_PIPELINE.md §2). The result is shared as an Inertia prop so the UI
 *  hides unavailable formats (UI_SPEC §1). D4: sharp is probed because
 *  Bun.Image AVIF support depends on the OS (PLANNING.md D4).
 */
import sharp from 'sharp'

export interface Capabilities {
  webp: boolean
  avif: boolean
}

/** Probe whether sharp can encode each format (16×16 raw RGBA test image). */
export async function capabilities(): Promise<Capabilities> {
  const raw = Buffer.alloc(16 * 16 * 4, 128)
  const source = { input: raw, raw: { width: 16, height: 16, channels: 4 as const } }
  const probe = async (format: 'webp' | 'avif'): Promise<boolean> => {
    try {
      await sharp(source.input, { raw: source.raw }).toFormat(format).toBuffer()
      return true
    }
    catch {
      return false
    }
  }
  const [webp, avif] = await Promise.all([probe('webp'), probe('avif')])
  return { webp, avif }
}

let cached: Promise<Capabilities> | null = null

/** Probe once per process and reuse (called from the shared Inertia props). */
export function probeCapabilities(): Promise<Capabilities> {
  cached ??= capabilities()
  return cached
}
