---
type: feature
---
# IMAGE_PIPELINE.md

Conversion, naming, versioning, and public delivery. This is the contract for `ImageConverter`, `ImageStore`, `UrlBuilder`, and the private preview controller; shared images are served by the bucket's files domain, never by the app.

## 1. Inputs

Accepted (sniffed by `sharp`, never by extension or client MIME): **JPEG, PNG, WebP, AVIF, GIF** (including animated).
Rejected with `415`: SVG (script risk), HEIC/HEIF (not in the default `sharp` build), TIFF, BMP, any non-image.

Limits (env, validated in `config/env.ts`):

| Env | Default | Meaning |
|---|---|---|
| `MAX_UPLOAD_MB` | 50 | Per-file encoded input size → `413` |
| `MAX_PIXELS` | 100000000 | Decoded pixel cap (decompression-bomb defense) → `422`. Pass to `sharp` as `limitInputPixels`. |
| `CONVERT_CONCURRENCY` | 2 | Max simultaneous encodes. Others wait in a semaphore. |

## 2. Convert options (chosen in the Review & convert dialog)

| Option | Values | Default |
|---|---|---|
| `format` | `webp` \| `avif` \| `original` | `webp` (env `DEFAULT_FORMAT`) |
| `quality` | 1 to 100 | webp 80, avif 55 (env `DEFAULT_QUALITY_WEBP`, `DEFAULT_QUALITY_AVIF`) |
| `maxDimension` | integer px or empty | empty (no resize). When set: fit inside a square, **never enlarge**. |

Rules:
- `original` stores the sniffed input bytes unchanged. It still strips nothing, so the dialog warns that metadata (including GPS) is kept. Prefer converting. Only the five accepted formats are allowed.
- **Animated inputs** (GIF, animated WebP): `webp` keeps animation (`sharp` `animated: true`); `avif` is **disabled** in the UI and rejected by the server — verified in task 1.1: sharp 0.35.5 encodes animated AVIF without error but **flattens it to a single frame** (output `pages: 1`), so allowing it would silently lose the animation; `original` keeps as is. Thumbnails use the first frame.
- Capability probe at boot: try encoding a 16×16 image to each format. Result `{ webp: bool, avif: bool }` is a shared Inertia prop. The server rejects an unavailable format with `422`.
- AVIF uses a moderate `effort` (about 4) to keep encodes fast. Make it an env value (`AVIF_EFFORT`).

## 3. Processing steps (in order)

1. Check size ≤ `MAX_UPLOAD_MB` (before reading the whole body if possible).
2. `sharp(buffer, { limitInputPixels, animated: <true for gif/webp> })` → `metadata()`; reject if format is not accepted or pixels exceed the cap.
3. `.rotate()` (auto-orient using EXIF), so stripping metadata later doesn't flip the picture.
4. Optional `.resize({ width: n, height: n, fit: 'inside', withoutEnlargement: true })`.
5. Encode to the chosen format. **Do not call `.withMetadata()`**: EXIF/GPS/ICC-profile extras are dropped so public images do not leak location. (Keep sRGB conversion.)
6. Build the thumbnail from the final image: 320 px wide, WebP, quality 70, first frame only.
7. sha256 of the stored bytes.
8. Write objects, then insert DB rows (§7).
9. Return `{ image, originalSize, storedSize, savedBytes, savedPercent }`.

`ImageConverter.convert(input, options)` is pure (bytes in, bytes + info out) and unit-tested without storage or DB.

## 4. Naming and versioning

**Identifiers**
- `publicId`: 12 chars, base62, from `crypto.getRandomValues`. Unique, unguessable, never reused.
- `version`: integer starting at 1 per image. `(image_id, version)` is unique.
- `slug`: from the display name. NFKD-normalize, drop diacritics, lowercase, non `[a-z0-9]` → `-`, collapse repeats, trim `-`, max 60 chars, fallback `image`.

**Versioned file name:** `{slug}.v{version}.{ext}`, for example `sunset-beach.v3.avif`.

**Storage keys** (opaque, independent of the display name)
```
images/{publicId}/v{version}.{ext}          original-or-converted image
images/{publicId}/v{version}.thumb.webp     thumbnail
trash/images/{publicId}/v{version}.{ext}    the same objects while trashed
```
An optional `STORAGE_PREFIX` (Guren S3 `prefix`) may sit in front. App code never builds keys by hand; `ImageStore` does. Trashing moves both objects of every affected version under `trash/`; restoring moves them back; permanent delete removes both locations.

**URL forms**

The bucket's files domain is the only public delivery path; the app is local
and never proxies image bytes to a shareable URL.

| Kind | URL | Meaning |
|---|---|---|
| Permanent | `{PUBLIC_FILES_BASE_URL}/images/{publicId}/v{n}.{ext}` | Exactly version `n`. Content never changes. |
| Thumbnail | `{PUBLIC_FILES_BASE_URL}/images/{publicId}/v{n}.thumb.webp` | Thumbnail of version `n`, always WebP. |
| App preview (private) | `/preview/{publicId}/{slug}.v{n}.{ext}` and `…v{n}.thumb.webp` | Session-only; for local-disk dev and when no files domain is set. Never copied. |

**Preview route parsing** (one route `GET /preview/:publicId/:file`, behind auth):
```
image:  ^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9][0-9]{0,5})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$
thumb:  ^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9][0-9]{0,5})\.thumb\.webp$
```
- Look up by `publicId` + `version`. **`slug` is ignored**, so renames never break the preview.
- If `ext` does not match the stored version's extension → `404`.
- The bucket URL contains no slug at all: it is the object key, so rename, move, star, and trash never change it.

**When versions change**

| Action | New version? | Effect |
|---|---|---|
| Upload | creates v1 | |
| Replace image | v(n+1), becomes current | old versions kept; the new version has a new bucket URL |
| Rename, move, star, trash, restore | no | object keys unchanged, so permanent URLs unchanged |
| Restore an older version | no | `current_version` pointer moves back; no new object |
| Prune | n/a | beyond `KEEP_VERSIONS` (default 5), oldest first; their permanent URLs then `404` |
| Permanent delete | n/a | every version's objects deleted, then rows |

Pruning never removes the current version. There is no "latest" URL: resolving
the current version needs the database, so anything that promised to update
would die with the app.

## 5. Delivery

**Bucket objects** are written with their stored MIME `Content-Type`
(`ImageStore.putVersion`). The app cannot write `Cache-Control` (Guren's S3
`PutOptions` carries only `contentType`/`metadata`, and app code must not import
the AWS SDK), so the public files domain adds the headers:

```
# Cloudflare cache rule on the files domain, path images/*
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff

# Cloudflare rule: block /trash/* with 404
```

- Every key under `images/` is an immutable `(publicId, version)` object, so a
  year-long cache is safe for that prefix.
- Trashed objects live under `trash/` (§4), which the second rule makes
  unreadable; the live key stops resolving the moment the object moves.
- A year-long edge cache outlives a takedown: configure a purge on trash
  (Cloudflare API token; not implemented) or keep the edge TTL short. A domain
  with caching off answers 404 as soon as the move lands.
- R2 settings: `STORAGE_DISK=s3`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
  `S3_REGION=auto`, `acl: false`. Public read is a bucket policy/custom-domain
  setting, never an object ACL written by the app.

**Private preview (`/preview/...`, session required)** exists so the local UI
still works with `STORAGE_DISK=local` (or before a files domain is configured):
```
Cache-Control: private, max-age=31536000, immutable
Content-Type: <stored mime, or image/webp for a thumb>
Content-Length
Content-Disposition: inline; filename="<slug>.v{n}.{ext}"     # ?download=1 → attachment
X-Content-Type-Options: nosniff
```
- `404` (with `Cache-Control: no-store`) for a guest, unknown publicId, unknown
  or pruned version, trashed image, extension mismatch, or malformed `file`.
- Do not do content negotiation (`Accept`). The stored format is the format.

## 6. Absolute URLs and the public files domain

`UrlBuilder` is the only place URLs are formatted. The app has no public base
URL: page links are relative, and every shareable URL comes from
`PUBLIC_FILES_BASE_URL`.

| Env | Used for | Example |
|---|---|---|
| `PUBLIC_FILES_BASE_URL` (optional) | permanent links, grid/lightbox sources, snippets | `https://files.example.com/images/{id}/v3.avif` |

- `permanent()` returns `{files base}/{object key}` or **null** without a files
  domain. `view()` and `thumb()` return the same bucket URLs, falling back to the
  private `/preview/...` route (relative) when the variable is unset.
- Markdown and HTML snippets embed the permanent URL; without a files domain
  they are null and the Share dialog explains that sharing is off.
- The Share dialog offers **This version** and **Thumbnail** only, both
  bucket-served. There is no "always latest" or share-page row: both need the
  database and would die with the app.
- `PUBLIC_FILES_BASE_URL` may point at a localhost domain in development; the
  dialog warns that such links only work on this machine.

**Trash and takedown.** Trashing moves every affected version's image and thumb
objects under `trash/` before the row write (a folder covers its subtree);
restoring moves them back after the row write. Permanent delete removes both
locations. The files domain must block `/trash/*`, so a trashed image is a 404
on the bucket without the app running. See §4 for the prefixes and §5 for the
rule.

## 7. Write order and failure handling

Upload (`version = 1`) and Replace (`version = n+1`) share one routine:

1. Convert (pure, in memory).
2. Write `storage_key` and `thumb_key` objects.
3. DB transaction: insert `image_versions` row, insert or update `images` (set `current_version`, `updated_at`).
4. On any failure after step 2 → delete both objects (best effort), then surface the error.
5. After success (replace only): prune beyond `KEEP_VERSIONS` (objects first, then rows). Prune failures are logged, not fatal.

Permanent delete: delete objects first (`deleteMany`, live and `trash/` keys), then rows. If storage fails, keep the rows and report an error so the user can retry. Trashing and restoring move the same objects between the two prefixes before (trash) or after (restore) the row write, with an object rollback when the row write fails.

## 8. Test matrix

- Converter: jpeg→webp, png→avif (skipped if unsupported), resize without enlargement, auto-rotate, EXIF stripped, animated gif→animated webp, avif rejected for animated, oversize and pixel-bomb rejected, svg/heic/text → 415.
- Naming: slug edge cases (unicode, emoji, empty, very long), `publicId` uniqueness and charset.
- Versioning: replace creates v2 and keeps v1 readable; latest serves v2; prune respects `KEEP_VERSIONS` and never removes current; restoring v1 moves the pointer only.
- Delivery: bucket keys carry the stored `Content-Type`; the files-domain rules are documented, not asserted in unit tests (no Cloudflare API). Private preview: headers per §5, `404` cases, extension mismatch, slug ignored, guest redirected to `/login`, no `/i`, `/t`, `/p` routes left.
- URLs: `permanent()` is null without a files domain; with it, `{files base}/images/...` for permanent, view and thumb, and no app-origin URL anywhere in a snippet.
- Cleanup: simulated DB failure leaves no objects; permanent delete removes every version's objects. Trash moves both objects of every affected version under `trash/` (including a folder's descendants) and restore moves them back; permanent delete removes the leftovers at both keys.