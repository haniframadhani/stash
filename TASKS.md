# TASKS.md

Work top to bottom, one task at a time. Tick `[x]` only when every acceptance criterion (AC) passes and `bun run typecheck && bun test && bunx guren gate` is green. Re-read the cited spec before starting a task.

---

## M0: Foundation

- [x] **0.1 Scaffold and merge the harness**
  `bunx create-guren-app stash --mode ssr --db sqlite --agents claude` (add other agents if you use them). Copy this pack's files into the repo. The scaffold's generated `AGENTS.md` / `CLAUDE.md` stay; merge `AGENTS.md` from this pack under `## Project: Stash`, and make sure `CLAUDE.md` contains `@AGENTS.md`. Confirm whether Tailwind is present; if not, add Tailwind and shadcn/ui.
  AC: `bun run dev` serves the welcome page on `:3333`; `bunx guren check` passes; the harness hooks are untouched.

- [x] **0.2 Env and config**
  Declare every variable from `.env.example` in `config/env.ts` (validated at boot). Add `config/images.ts` that exposes typed settings (formats, defaults, caps, `KEEP_VERSIONS`, thumb width).
  AC: a missing or invalid variable fails boot with a readable message naming it.

- [x] **0.3 Storage config and bucket**
  Run `bunx guren add storage`, then shape `config/storage.ts` as in `PLANNING.md` §10 (`local` and `s3` disks, `STORAGE_DISK` check, `acl: false`, `endpoint`). Add `docker-compose.yml` (SeaweedFS + `bucket-init`).
  AC: `docker compose up -d` creates the bucket; with `STORAGE_DISK=s3`, a script `put` then `get` then `delete` round-trips; with `STORAGE_DISK=local` it also works.

- [x] **0.4 Single-user auth**
  `bunx guren make:auth --minimal --install`. Seeder creates one user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (idempotent; updates the hash if it changed). Confirm there is no `/register` and no password-reset route.
  AC: login works; `/register` is 404; five rapid bad logins get throttled; the seeded password is stored only as a hash.

- [x] **0.5 Storage contract test and S3 compatibility check**
  `tests/storage-contract.test.ts`: put, get, exists, delete, deleteMany, metadata (content type). Runs on `memory` and `local` always, and on the live endpoint with `RUN_S3_TESTS=1`. Verified: S3 driver works with plain `endpoint` (path-style) on SeaweedFS; MinIO not tested. If the driver cannot do path-style, a workaround would be needed in `PLANNING.md` §10.
  AC: contract test green on memory, local, and live SeaweedFS.

- [ ] **0.6 `sharp` spike and capability probe**
  Add `sharp`. Prove under Bun, in the dev environment **and** in a Docker `oven/bun` container, that it encodes WebP and AVIF and decodes the five accepted formats. Write `capabilities()` (encodes a 16×16 image per format) and expose it as a shared Inertia prop. Record results in the decision log; if AVIF fails, the UI must hide it.
  AC: `capabilities()` returns `{ webp: true, avif: true|false }` correctly; test covers both outcomes via a stub.

- [ ] **0.7 Schema, models, health**
  Implement `db/schema.ts` per `PLANNING.md` §6 (including the partial unique indexes, hand-written SQL if needed), models `Folder`, `Image`, `ImageVersion`, migrations, and `GET /health` (db + storage check via Guren health checks).
  AC: duplicate active sibling names (case-insensitive) are rejected by the DB; `/health` returns 503 when storage is down.

## M1: Upload, convert, serve

- [ ] **1.1 ImageConverter**
  `app/Services/ImageConverter.ts` per `docs/IMAGE_PIPELINE.md` §1 to §3 (pure, concurrency semaphore, metadata stripped, auto-rotate, never enlarge, animated handling). Record whether animated AVIF is supported.
  AC: all converter cases in `IMAGE_PIPELINE.md` §8 pass.

- [ ] **1.2 ImageStore, UrlBuilder, Slug, NamePolicy**
  `ImageStore` (put and read objects by version, delete, prune, keys built only here), `UrlBuilder` (all URL forms, Markdown and HTML snippets, `PUBLIC_BASE_URL`), `Slug`, `NamePolicy` (` (1)` suffix on sibling clashes).
  AC: unit tests for slug edge cases, key format, URL forms, and name clashes.

- [ ] **1.3 Public image routes**
  `routes/public.ts`: `image.show`, `image.latest`, `image.thumb` exactly per `IMAGE_PIPELINE.md` §4 to §5 (route parsing, headers, `304` before storage, `HEAD`, 404 cases). **Verify no `Set-Cookie`**; if the global session/CSRF middleware adds cookies, exclude or re-mount these routes, and log the mechanism.
  AC: delivery tests from §8 pass, including "304 performs zero storage reads" and "no Set-Cookie".

- [ ] **1.4 Upload endpoint**
  `POST /uploads` per `docs/ROUTES_SPEC.md` §4: validate options (zod), convert, write objects, DB transaction (image + version 1), cleanup on failure, return savings.
  AC: uploading a JPEG as WebP creates `images/{publicId}/v1.webp` and `v1.thumb.webp`, one `images` row, one `image_versions` row; failure after the object write leaves no objects; 413/415/422 cases return the right status; unauthenticated → rejected.

- [ ] **1.5 App shell and login page**
  Layout per `UI_SPEC.md` §1, login page (no register link), shared props (`auth`, `capabilities`, `storage`, `publicBaseUrl`, `flash`), sidebar and top bar, theme tokens.
  AC: responsive at 360 / 768 / 1440 px; logging out returns to `/login`.

- [ ] **1.6 Browse root (grid and list)**
  `drive.index` at root with sort and order, `ImageCard`, list view, skeleton, empty and error states.
  AC: 50 seeded images scroll smoothly; thumbnails lazy-load from the permanent thumb URL.

- [ ] **1.7 Review & convert dialog and upload queue**
  Per `UI_SPEC.md` §3 and §4: drop, paste, picker → dialog → Confirm → queue (concurrency 2, progress, cancel, retry, savings). AVIF disabled per capability and for animated inputs; unsupported or oversized files flagged.
  AC: dropping 20 mixed files (including an SVG and a 60 MB file) shows 18 valid rows and 2 flagged; Confirm uploads them; nothing is sent before Confirm (verified in a test or manual network log).

## M2: Browse and organize

- [ ] **2.1 Folder CRUD and navigation**
  `folders.store`, `folders.update`, `/files/:folderId`, breadcrumbs, "New folder" dialog. Cycle rejection.
  AC: unit tests cover cycle detection (self, child, deep descendant); deep links and refresh work; unknown id → 404 page.

- [ ] **2.2 Rename and details**
  Inline rename (F2) for images and folders; images update `name` and `slug` but not the version.
  AC: renaming an image keeps its existing permanent link working (test); a sibling name clash shows an inline error.

- [ ] **2.3 Selection and bulk bar**
  Click, Ctrl/Cmd, Shift range, Ctrl/Cmd+A, Esc; floating action bar.
  AC: selection clears on folder change.

- [ ] **2.4 Move**
  `items.move` (atomic, rejects cycles), drag and drop onto folder, breadcrumb, sidebar; "Move to…" picker.
  AC: optimistic update with rollback on error.

- [ ] **2.5 Context menu and lightbox**
  Right-click and long-press menu; lightbox with prev/next, keyboard, download, info panel.
  AC: keyboard navigation works across the current folder's images.

## M3: Versioning and sharing

- [ ] **3.1 Replace image (new version)**
  `images.replace` per `IMAGE_PIPELINE.md` §4 and §7: write `v(n+1)`, flip `current_version` in one transaction, then prune beyond `KEEP_VERSIONS`. "Replace image…" reuses the Review dialog in single-file mode.
  AC: after a replace, the latest URL serves the new bytes with a new ETag; the previous permanent URL still serves the old bytes; the pointer flip is atomic (test with an injected failure).

- [ ] **3.2 Versions panel and restore**
  Details panel lists versions with copy-permanent-link, **Make current**, open. `images.restoreVersion` moves only the pointer.
  AC: restoring v1 serves v1 on the latest URL; v2's permanent URL still works; pruned versions return 404.

- [ ] **3.3 Share dialog**
  Per `UI_SPEC.md` §5: latest, permanent, share page, Markdown/HTML snippets, AVIF warning, localhost hint, multi-select copy.
  AC: copied URLs open in a private window without login and show the expected version.

- [ ] **3.4 Share page**
  `GET /p/:publicId` via `this.view()` (no hydration): image, metadata, download, OG/Twitter tags.
  AC: `og:image` is the permanent URL; trashed images 404; no cookies set.

- [ ] **3.5 Cache behavior tests (end to end)**
  Replace an image and assert: pinned = immutable, latest = revalidating, ETag differs, `304` works, thumbnails are pinned.
  AC: the whole `IMAGE_PIPELINE.md` §5 header table is asserted in tests.

## M4: Drive polish

- [ ] **4.1 Star and Starred view**; **4.2 Trash**
  `items.star`, `items.trash`, `items.restore`, `items.delete`, `trash.empty`, Trash page. Trashed images' public URLs return 404 immediately.
  AC: after "Delete forever", **every version's** objects are gone and rows removed (test with the memory disk); trashing a folder hides descendants; restore with a trashed parent goes to root.
- [ ] **4.3 Recent** (last 100, grouped by day). **4.4 Search** (name contains, debounced, `/search`).
- [ ] **4.5 Storage meter** (sum of `image_versions.size`, counts) and **sort/view prefs** (persisted in `localStorage`).
- [ ] **4.6 Auto-purge**: Guren scheduled task deletes trash older than `TRASH_RETENTION_DAYS` using the same permanent-delete routine.
  AC: a test with a fake clock purges only expired items.

## M5: Hardening and operations

- [ ] **5.1 Reconcile command**: `bun run console images:reconcile [--dry-run]` reports storage objects with no row and rows with missing objects; deletes orphans only with an explicit flag, never on a listing error.
- [ ] **5.2 Rate limits**: Guren rate limiter on public routes (generous) and upload/replace (modest).
- [ ] **5.3 Route-guard test**: `tests/route-guard.test.ts` per `ROUTES_SPEC.md` §6.
- [ ] **5.4 Accessibility and shortcuts**: focus management, ARIA grid, shortcuts table, reduced motion.
- [ ] **5.5 Dark mode**: follow system, with a manual toggle.
- [ ] **5.6 E2E smoke** (Playwright or the scaffold's choice): login, review and convert, upload, copy link, open it logged-out, replace, check old and new links, trash, restore, delete forever.
- [ ] **5.7 Docker deploy**: `bunx guren deploy --target docker`; enable the `app` profile in compose; `sharp` works in the image; `data/` mounted.
  AC: `docker compose --profile app up -d` serves the app and passes `/health`.
- [ ] **5.8 README**: quick start, env reference, swapping storage backends, sharing beyond LAN (tunnel and `PUBLIC_BASE_URL`), **backups (SQLite and bucket)**.

---

## Backlog (do not start unless asked)

- Move conversion into a Guren queue worker (`queued` flow)
- On-the-fly resize (`?w=`) with a derived-file cache
- Optional per-image "unlisted vs private" (signed or authenticated reads)
- Public listing mode (browse without login)
- Preview savings before upload (staged conversion)
- HEIC support, EXIF "taken at" sorting, albums and tags, zip download
- Direct-to-bucket uploads (presigned) and public-bucket delivery mode
- Duplicate finder using `sha256`
- WebP fallback for AVIF via `Accept` negotiation

## Decision log

_Agents: append one line per non-obvious decision: date · task · decision · reason._

- 2026-11-11 · 0.2 · `PUBLIC_FILE_BASE_URL` renamed to `PUBLIC_BASE_URL`; image settings exposed as a `defineConfig` binding (`images`) resolved from the validated env · matches PLANNING.md §7/§11 and gives services typed settings without reading `process.env`.
- 2026-11-11 · 0.3 · `@aws-sdk/client-s3` added as a direct dependency · Guren's S3 driver imports it dynamically; app code still touches storage only through `storage.disk()`.
- 2026-11-11 · 0.3 · Compose pins `chrislusf/seaweedfs:4.53` and creates the bucket in a one-shot `bucket-init` (`weed shell`, retried until listed) · keeps `docker compose up -d` idempotent without a second toolkit image.
- 2026-11-11 · 0.4 · The owner seeder rewrites the hash only when `ADMIN_PASSWORD` no longer verifies against the stored one · keeps `db:seed` idempotent and never creates a second account on re-run.
- 2026-11-11 · 0.5 · S3 driver works with plain `endpoint` (path-style) on SeaweedFS · conformance test passes on memory, local, and live SeaweedFS endpoint; no vendor-specific SDK used; app code touches storage only through `storage.disk()`.
- 2026-11-11 · 0.4 · Boot seeding is development-only, and `tests/setup.ts` (a `bunfig.toml` test preload) supplies a per-run `APP_KEY` · `bun test` and CI run without a `.env`, and tests own their rows instead of inheriting a seeded owner.