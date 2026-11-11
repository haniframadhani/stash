---
type: feature
---
# IMAGE_PIPELINE.md

Conversion, naming, versioning, and public delivery. This is the contract for `ImageConverter`, `ImageStore`, `UrlBuilder`, and the public image controllers.

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
- **Animated inputs** (GIF, animated WebP): `webp` keeps animation (`sharp` `animated: true`); `avif` is **disabled** in the UI and rejected by the server (verify support in task 1.1 and record it); `original` keeps as is. Thumbnails use the first frame.
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
```
An optional `STORAGE_PREFIX` (Guren S3 `prefix`) may sit in front. App code never builds keys by hand; `ImageStore` does.

**URL forms**

| Kind | Path | Meaning |
|---|---|---|
| Permanent | `/i/{publicId}/{slug}.v{n}.{ext}` | Exactly version `n`. Content never changes. |
| Latest | `/i/{publicId}/{slug}.{ext}` | Current version. Revalidates. |
| Latest (short) | `/i/{publicId}` | Same as Latest, any extension. |
| Thumbnail | `/t/{publicId}/{slug}.v{n}.webp` | Thumbnail of version `n`. |
| Share page | `/p/{publicId}` | HTML page, OG tags. |

**Route parsing** (one route `GET /i/:publicId/:file`):
```
pinned:  ^(?<slug>[a-z0-9-]{1,60})\.v(?<version>[1-9][0-9]{0,5})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$
latest:  ^(?<slug>[a-z0-9-]{1,60})\.(?<ext>avif|webp|jpg|jpeg|png|gif)$
```
- Look up by `publicId` (+ `version` when pinned). **`slug` is ignored**, so renames never break links.
- If `ext` does not match the stored version's extension → `404`.
- On *latest*, `ext` must match the *current* version's extension. If the format changed after a replace, the old-extension latest URL returns `404`; `/i/{publicId}` (no extension) always works. The Share dialog uses the extension-less form only when asked.

**When versions change**

| Action | New version? | Effect |
|---|---|---|
| Upload | creates v1 | |
| Replace image | v(n+1), becomes current | old versions kept |
| Rename, move, star, trash, restore | no | URLs unchanged (slug is cosmetic) |
| Restore an older version | no | `current_version` pointer moves back; no new object |
| Prune | n/a | beyond `KEEP_VERSIONS` (default 5), oldest first; their permanent URLs then `404` |
| Permanent delete | n/a | every version's objects deleted, then rows |

Pruning never removes the current version.

## 5. HTTP delivery

**Pinned (`/i/.../x.v3.avif`) and thumbnails**
```
Cache-Control: public, max-age=31536000, immutable
ETag: "<sha256 first 16 hex>"
```
**Latest (`/i/{publicId}...`)**
```
Cache-Control: public, no-cache          # always revalidate; 304 when ETag matches
ETag: "<sha256 first 16 hex>"
```
**All image responses**
```
Content-Type: <stored mime>
Content-Length
Content-Disposition: inline; filename="<slug>.v3.avif"     # ?download=1 → attachment
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: cross-origin
Access-Control-Allow-Origin: *
(no Set-Cookie, no Vary: Cookie)
```
- Support `GET` and `HEAD`. `If-None-Match` → `304` **before** touching storage.
- `404` (with `Cache-Control: no-store`) for unknown `publicId`, unknown or pruned version, trashed image, extension mismatch, or malformed `file`.
- Do not do content negotiation (`Accept`). The stored format is the format.

**Share page `/p/{publicId}`**: server-rendered `this.view()` (no hydration). Shows the image (permanent URL), name, dimensions, size, a download button, and OG/Twitter meta (`og:image` = permanent URL, `og:image:width/height`). `Cache-Control: public, no-cache`. 404 when trashed.

## 6. Absolute URLs

`UrlBuilder` builds absolute URLs from `PUBLIC_BASE_URL` (falls back to the request origin). It is the only place URLs are formatted. It exposes `thumb`, `permanent`, `latest`, `page`, plus `markdown()` and `html()` snippets (`<img src="…" width height alt>`).

## 7. Write order and failure handling

Upload (`version = 1`) and Replace (`version = n+1`) share one routine:

1. Convert (pure, in memory).
2. Write `storage_key` and `thumb_key` objects.
3. DB transaction: insert `image_versions` row, insert or update `images` (set `current_version`, `updated_at`).
4. On any failure after step 2 → delete both objects (best effort), then surface the error.
5. After success (replace only): prune beyond `KEEP_VERSIONS` (objects first, then rows). Prune failures are logged, not fatal.

Permanent delete: delete objects first (`deleteMany`), then rows. If storage fails, keep the rows and report an error so the user can retry.

## 8. Test matrix

- Converter: jpeg→webp, png→avif (skipped if unsupported), resize without enlargement, auto-rotate, EXIF stripped, animated gif→animated webp, avif rejected for animated, oversize and pixel-bomb rejected, svg/heic/text → 415.
- Naming: slug edge cases (unicode, emoji, empty, very long), `publicId` uniqueness and charset.
- Versioning: replace creates v2 and keeps v1 readable; latest serves v2; prune respects `KEEP_VERSIONS` and never removes current; restoring v1 moves the pointer only.
- Delivery: headers per §5, `304` without a storage read (assert with a spy on the disk), `HEAD`, `404` cases, no `Set-Cookie`, ext mismatch, slug ignored.
- Cleanup: simulated DB failure leaves no objects; permanent delete removes every version's objects.