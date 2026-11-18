/** Private image preview (docs/ROUTES_SPEC.md §1, IMAGE_PIPELINE.md §5).
 *  The bucket's public domain is the real delivery path; this route exists so
 *  the app's own browser still shows thumbnails and the lightbox when
 *  `PUBLIC_FILES_BASE_URL` is unset (local disk dev). It sits behind
 *  `requireAuthenticated` and is never handed out as a link. `{slug}` is
 *  cosmetic: everything resolves by publicId and version.
 */
import { Controller } from '@guren/core'
import { Image } from '../../Models/Image.js'
import { ImageVersion } from '../../Models/ImageVersion.js'
import { ImageStore } from '../../Services/ImageStore.js'
import { trashedFolderIds } from '../../Services/Trash.js'
import { previewThumbName, versionedFileName } from '../../Services/UrlBuilder.js'

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{12}$/
const PINNED_FILE = /^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9]\d{0,5})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$/
const PINNED_THUMB = /^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9]\d{0,5})\.thumb\.webp$/
const THUMB_EXT = 'webp'
const IMMUTABLE_PRIVATE = 'private, max-age=31536000, immutable'

type ParsedFile =
  | { kind: 'image', version: number, ext: string }
  | { kind: 'thumb', version: number }

export default class PreviewImageController extends Controller {
  /** `GET /preview/:publicId/:file` — a pinned image or its thumbnail. */
  async show(): Promise<Response> {
    const publicId = this.request.param('publicId') ?? ''
    if (!PUBLIC_ID_PATTERN.test(publicId)) return notFound()

    const parsed = parseFile(this.request.param('file') ?? '')
    if (!parsed) return notFound()

    const image = await Image.where({ publicId }).whereNull('deletedAt').first()
    if (!image) return notFound()
    // A trashed folder hides its contents (PLANNING.md §6): the image row is
    // active, but its ancestor is in the Trash, so the preview is gone too.
    if (image.folderId !== null && (await trashedFolderIds()).has(image.folderId)) return notFound()

    const version = await ImageVersion.first({ imageId: image.id, version: parsed.version })
    if (!version) return notFound()
    // The stored format is the format; an extension that does not match the
    // version's own is a stale link → 404.
    if (parsed.kind === 'image' && parsed.ext !== version.ext) return notFound()

    const store = ImageStore.fromContainer()
    const bytes = parsed.kind === 'thumb'
      ? await store.readThumb(version.thumbKey)
      : await store.readImage(version.storageKey)
    // The row survived but the object did not (drift): nothing to serve.
    if (!bytes) return notFound()

    const disposition = this.request.query('download') === '1' ? 'attachment' : 'inline'
    const ext = parsed.kind === 'thumb' ? THUMB_EXT : version.ext
    const fileName = parsed.kind === 'thumb'
      ? previewThumbName(image.slug, version.version)
      : versionedFileName(image.slug, version.version, ext)
    // Thumbs are always WebP bytes even when the stored version is another
    // format; the version row describes the stored object, the response the
    // object actually served.
    const contentType = parsed.kind === 'thumb' ? 'image/webp' : version.mime
    return new Response(bodyBytes(bytes), {
      status: 200,
      headers: {
        'Cache-Control': IMMUTABLE_PRIVATE,
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}

function parseFile(file: string): ParsedFile | null {
  const thumb = PINNED_THUMB.exec(file)
  if (thumb?.groups) return { kind: 'thumb', version: Number(thumb.groups.version) }
  const image = PINNED_FILE.exec(file)
  if (image?.groups) return { kind: 'image', version: Number(image.groups.version), ext: image.groups.ext }
  return null
}

/** `Response` wants a web `BodyInit`; hand it the buffer's exact bytes. */
function bodyBytes(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Every not-found carries `Cache-Control: no-store`, so a restored image is
 *  never stuck behind a cached 404. */
function notFound(): Response {
  return new Response(JSON.stringify({ message: 'Not found.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
