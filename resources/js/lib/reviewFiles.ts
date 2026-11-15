/** Client-side review of dropped or pasted files before anything is uploaded
 *  (UI_SPEC §3). The server sniffs the real bytes later; this mirrors that
 *  check from each file's first bytes, so unsupported and oversized files are
 *  flagged in the dialog and never sent.
 */

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif'

export type Sniff =
  | { kind: 'image', format: SniffedFormat }
  | { kind: 'rejected', reason: 'svg' | 'heic' }
  | { kind: 'unknown' }

/** Magic-byte sniff over the file head — the same accept list as the server
 *  (docs/IMAGE_PIPELINE.md §1): JPEG, PNG, WebP, AVIF, GIF; SVG and HEIC are
 *  rejected, everything else is "unknown" (non-image, TIFF, BMP, …). */
export function sniffImageFormat(head: Uint8Array): Sniff {
  const ascii = (from: number, text: string): boolean => {
    for (let index = 0; index < text.length; index++) {
      if (head[from + index] !== text.charCodeAt(index)) return false
    }
    return true
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', format: 'jpeg' }
  if (ascii(0, 'GIF8')) return { kind: 'image', format: 'gif' }
  if (head[0] === 0x89 && ascii(1, 'PNG')) return { kind: 'image', format: 'png' }
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { kind: 'image', format: 'webp' }
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(head[8] ?? 0, head[9] ?? 0, head[10] ?? 0, head[11] ?? 0)
    if (brand.startsWith('av')) return { kind: 'image', format: 'avif' }
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'rejected', reason: 'heic' }
    }
    return { kind: 'unknown' }
  }
  // A BOM and whitespace, then a leading '<' names SVG or any other text.
  let start = 0
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) start = 3
  while (start < head.length && (head[start] === 0x20 || head[start] === 0x0a || head[start] === 0x0d || head[start] === 0x09)) start++
  if (head[start] === 0x3c) return { kind: 'rejected', reason: 'svg' }
  return { kind: 'unknown' }
}

function hasMarker(head: Uint8Array, marker: string): boolean {
  const first = marker.charCodeAt(0)
  outer: for (let index = 0; index + marker.length <= head.length; index++) {
    if (head[index] !== first) continue
    for (let offset = 1; offset < marker.length; offset++) {
      if (head[index + offset] !== marker.charCodeAt(offset)) continue outer
    }
    return true
  }
  return false
}

/** Animated GIF/WebP/APNG keep their animation only as WebP or Original; AVIF
 *  would flatten them to one frame (IMAGE_PIPELINE §2), so those rows cannot
 *  pick AVIF. The server stays authoritative and rejects AVIF for animated
 *  inputs anyway. */
export function looksAnimated(format: SniffedFormat, head: Uint8Array): boolean {
  if (format === 'gif') return hasMarker(head, 'NETSCAPE2.0')
  if (format === 'webp') return hasMarker(head, 'ANMF')
  if (format === 'png') return hasMarker(head, 'acTL')
  return false
}

export interface ReviewRow {
  id: number
  file: File
  name: string
  size: number
  /** Invalid rows carry `problem`, are excluded from the upload count and are
   *  never sent (UI_SPEC §3). */
  valid: boolean
  problem?: string
  animated: boolean
}

export interface ReviewCaps {
  avif: boolean
  maxUploadMb: number
}

/** How far into the file the animated markers can sit: a GIF's global palette
 *  is at most 768 bytes, so 4096 covers the header, palette and first blocks. */
const HEAD_BYTES = 4096

let nextRowId = 1

export async function classifyReviewFiles(files: readonly File[], caps: ReviewCaps): Promise<ReviewRow[]> {
  return Promise.all(
    Array.from(files, async (file): Promise<ReviewRow> => {
      const row: ReviewRow = {
        id: nextRowId++,
        file,
        name: file.name,
        size: file.size,
        valid: false,
        animated: false,
      }
      if (file.size > caps.maxUploadMb * 1024 * 1024) {
        row.problem = `Larger than the ${caps.maxUploadMb} MB limit.`
        return row
      }
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
      const sniff = sniffImageFormat(head)
      if (sniff.kind === 'rejected') {
        row.problem = sniff.reason === 'svg'
          ? 'SVG is not accepted (scripts can hide in it).'
          : 'HEIC is not supported by the converter.'
        return row
      }
      if (sniff.kind === 'unknown') {
        row.problem = 'Not an image the converter accepts (JPEG, PNG, WebP, AVIF or GIF).'
        return row
      }
      row.valid = true
      row.animated = looksAnimated(sniff.format, head)
      return row
    }),
  )
}
