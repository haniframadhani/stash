/** Public image delivery (ROUTES_SPEC §1, IMAGE_PIPELINE.md §4 to §5).
 *  No login, no cookies on the responses (SessionCsrfProvider excludes these
 *  prefixes from the session and CSRF middleware). The `{slug}` segment is
 *  cosmetic: everything resolves by publicId (+ version when pinned), so
 *  renames never break a link. `If-None-Match` is answered before storage is
 *  touched, so a 304 performs zero storage reads.
 */
import { Controller } from '@guren/core'
import { Image } from '../../Models/Image.js'
import { ImageVersion } from '../../Models/ImageVersion.js'
import { ImageStore } from '../../Services/ImageStore.js'
import { trashedFolderIds } from '../../Services/Trash.js'
import { versionedFileName } from '../../Services/UrlBuilder.js'

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{12}$/
const PINNED_FILE = /^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9]\d{0,5})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$/
const LATEST_FILE = /^(?<slug>[a-z0-9-]{1,60})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$/
const THUMB_EXT = 'webp'
const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'public, no-cache'

type ParsedFile =
  | { kind: 'pinned', version: number, ext: string }
  | { kind: 'latest', ext: string | undefined }

export default class PublicImageController extends Controller {
  /** `GET /i/:publicId/:file` — pinned or latest-with-extension. */
  async show(): Promise<Response> {
    const parsed = parseFile(this.request.param('file') ?? '')
    if (!parsed) return notFound()
    return this.deliver({ parsed, isThumb: false })
  }

  /** `GET /i/:publicId` — latest, extension-less. */
  async latest(): Promise<Response> {
    return this.deliver({ parsed: { kind: 'latest', ext: undefined }, isThumb: false })
  }

  /** `GET /t/:publicId/:file` — thumbnail of a pinned version, always `.webp`. */
  async thumb(): Promise<Response> {
    const parsed = parseFile(this.request.param('file') ?? '')
    if (!parsed || parsed.kind !== 'pinned' || parsed.ext !== THUMB_EXT) return notFound()
    return this.deliver({ parsed, isThumb: true })
  }

  private async deliver(input: { parsed: ParsedFile, isThumb: boolean }): Promise<Response> {
    const publicId = this.request.param('publicId') ?? ''
    if (!PUBLIC_ID_PATTERN.test(publicId)) return notFound()

    const image = await Image.where({ publicId }).whereNull('deletedAt').first()
    if (!image) return notFound()
    // A trashed folder hides its contents (PLANNING.md §6): the image row is
    // active, but its ancestor is in the Trash, so the link is gone too.
    if (image.folderId !== null && (await trashedFolderIds()).has(image.folderId)) return notFound()

    const wanted = input.parsed.kind === 'pinned' ? input.parsed.version : image.currentVersion
    const version = await ImageVersion.first({ imageId: image.id, version: wanted })
    if (!version) return notFound()

    // The stored format is the format; no content negotiation. An extension
    // that does not match the version's own is a stale link → 404. Thumbs are
    // always `.webp` regardless of the stored format (IMAGE_PIPELINE.md §4), so
    // the check only applies to the image itself.
    if (!input.isThumb && input.parsed.ext !== undefined && input.parsed.ext !== version.ext) return notFound()

    const immutable = input.isThumb || input.parsed.kind === 'pinned'
    const etag = `"${version.sha256.slice(0, 16)}"`
    const cacheControl = immutable ? IMMUTABLE : REVALIDATE
    const cacheHeaders: Record<string, string> = { ETag: etag, 'Cache-Control': cacheControl }

    if (etagMatches(this.request.header('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: cacheHeaders })
    }

    const store = ImageStore.fromContainer()
    const bytes = input.isThumb
      ? await store.readThumb(version.thumbKey)
      : await store.readImage(version.storageKey)
    // The row survived but the object did not (drift): nothing cacheable to serve.
    if (!bytes) return notFound()

    const disposition = this.request.query('download') === '1' ? 'attachment' : 'inline'
    const ext = input.isThumb ? THUMB_EXT : version.ext
    // Thumbs are always WebP bytes even when the stored version is AVIF/WebP-
    // less; the format names describe the version, the response describes the
    // object actually served.
    const contentType = input.isThumb ? 'image/webp' : version.mime
    return new Response(bodyBytes(bytes), {
      status: 200,
      headers: {
        ...cacheHeaders,
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${disposition}; filename="${versionedFileName(image.slug, version.version, ext)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

function parseFile(file: string): ParsedFile | null {
  const pinned = PINNED_FILE.exec(file)
  if (pinned?.groups) return { kind: 'pinned', version: Number(pinned.groups.version), ext: pinned.groups.ext }
  const latest = LATEST_FILE.exec(file)
  if (latest?.groups) return { kind: 'latest', ext: latest.groups.ext }
  return null
}

/** `*`, a single ETag, or one in a comma list; a weak marker `W/` is ignored. */
function etagMatches(headerValue: string | undefined, etag: string): boolean {
  if (!headerValue) return false
  if (headerValue.trim() === '*') return true
  return headerValue.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//i, '')
    return normalized === etag || normalized === etag.replaceAll('"', '')
  })
}

/** `Response` wants a web `BodyInit`; hand it the buffer's exact bytes. */
function bodyBytes(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** §5: every not-found carries `Cache-Control: no-store`, so a replaced or
 *  restored image is never stuck behind a cached 404. */
function notFound(): Response {
  return new Response(JSON.stringify({ message: 'Not found.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
