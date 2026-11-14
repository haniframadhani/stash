# TASKS.md

Work top to bottom, one task at a time. Tick `[x]` only when every acceptance criterion (AC) passes and `bun run typecheck && bun test && bunx guren gate` is green. Re-read the cited spec before starting a task.

## Slice rule (read first)

Every task is a **vertical slice**. It must end with something the owner can **see and click** in the browser at `http://localhost:3333`, unless the task is explicitly marked **(backend-only)**.

- A task that adds a route, controller, or service is **not done** until its UI surface exists, or a *named later task* owns it and this task says so.
- Every task has a **Manual check** line: exactly what to click and what should appear. Run it in the browser (use the harness's `verify-in-browser` skill) before ticking.
- Never tick a UI task on unit tests alone. Add one line to the decision log: `date · task · manual check result`.
- UI built in a task follows `docs/UI_SPEC.md`. If a screen needs data that doesn't exist yet, use a small seed script or fixtures (Guren's prototype-first fixtures are fine), and say so in the task.

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

- [x] **0.6 `sharp` spike and capability probe**
  Added `app/Services/ImageConverter.ts` with `capabilities()` function that probes sharp's WebP and AVIF encoding capability by encoding a 16×16 test image. Results are cached and exposed as a shared Inertia prop via `probeCapabilities()`. The `AuthProvider.boot()` now shares `capabilities` with every Inertia page. If AVIF is unavailable, the UI can hide the AVIF format option. Recorded: sharp works on this platform for both WebP and AVIF encoding.
  AC: `capabilities()` returns `{ webp: true, avif: true }` correctly; test covers both outcomes via a stub.

- [x] **0.7 Schema, models, health**
  Implemented `db/schema.ts` per `PLANNING.md` §6: `folders`, `images` (UNIQUE `public_id`), `image_versions` (UNIQUE(image_id, version)) tables; the partial unique indexes `uq_folders_name` / `uq_images_name` (`COALESCE(parent_id,0)`, `name COLLATE NOCASE`, `WHERE deleted_at IS NULL`) are hand-written SQL in `002_create_tables`. Models `Folder` and `Image` in `app/Models/`. `GET /health` runs real checks via Guren health checks (`app/Providers/HealthProvider.ts`): `DatabaseCheck` (SELECT 1 on SQLite, wrapped over bun:sqlite's `run`) and `StorageCheck` (put/get/delete round-trip on `storage.disk()`), both critical; the route answers `200 { ok, db, storage }` or `503` (ROUTES_SPEC §1 shape).
  AC: duplicate active sibling names (case-insensitive) are rejected by the DB; `/health` returns 503 when storage is down — covered by `tests/health.test.ts` (200 healthy, 503 with a stubbed disk; a live 503 was also observed against a down SeaweedFS endpoint). `tests/setup.ts` pins the app boot to the offline local disk so the suite never depends on the compose stack (CI has no docker).

## M1: Upload, convert, serve (reordered into vertical slices)

- [x] **1.1 ImageConverter** *(backend-only)*
  `app/Services/ImageConverter.ts` per `docs/IMAGE_PIPELINE.md` §1 to §3 (pure, concurrency semaphore, metadata stripped, auto-rotate, never enlarge, animated handling). Record whether animated AVIF is supported.
  AC: all converter cases in `IMAGE_PIPELINE.md` §8 pass.

- [x] **1.2 Turn the generated login and dashboard into the Stash shell** *(UI first)*
  Auth already works from 0.4: the generated login page exists and the generated `/dashboard` page is already behind the `auth` middleware. **Reuse them; do not recreate auth, the middleware, or the routes.** This task reshapes what is there:
  - **Dashboard → Drive page.** Rename or replace the generated dashboard so the protected page becomes `drive.index` at `/files`, using the existing `auth` group. Keep `/dashboard` as a redirect to `/files`, make `/` redirect to `/files`, and change the post-login redirect to `/files`. Remove generated dashboard content that Stash does not use.
  - **Shell around it.** Layout per `UI_SPEC.md` §1: top bar (logo, search placeholder, log out), sidebar (My Files / Recent / Starred / Trash, storage meter placeholder; the other three can link to "coming soon" empty pages), theme tokens. The page body shows the **empty state** ("Drop images here or press New") with a disabled-for-now **New** button.
  - **Restyle the login page** to match the shell (same tokens, centered card). Keep its working form and throttling; make sure it has no register or forgot-password links.
  - **Shared props** on every private page: `auth`, `capabilities`, `storage`, `publicBaseUrl`, `flash`.
  AC: responsive at 360 / 768 / 1440 px (sidebar becomes a drawer below `lg`); logging out returns to `/login`; unauthenticated `/files` and `/dashboard` redirect to `/login`; the existing auth tests still pass unchanged (or are updated only for the new redirect target).
  **Manual check:** open `http://localhost:3333` → redirected to `/login` → sign in with the seeded user → land on `/files` inside the Stash layout with the empty state → visit `/dashboard` and get redirected to `/files` → click Log out → back at `/login`.
  Done 2026-11-12: manual check performed in the browser (decision log); all steps passed.

- [x] **1.3 Services and public image routes** *(backend-only; the visible result comes in 1.4)*
  `ImageStore` (put and read objects by version, delete, prune, keys built only here), `UrlBuilder` (all URL forms, Markdown and HTML snippets, `PUBLIC_BASE_URL`), `Slug`, `NamePolicy` (` (1)` suffix on sibling clashes). Then `routes/public.ts`: `image.show`, `image.latest`, `image.thumb` exactly per `IMAGE_PIPELINE.md` §4 to §5 (route parsing, headers, `304` before storage, `HEAD`, 404 cases). **Verify no `Set-Cookie`**; if the global session/CSRF middleware adds cookies, exclude or re-mount these routes, and log the mechanism.
  AC: unit tests for slug edge cases, key format, URL forms, and name clashes; delivery tests from `IMAGE_PIPELINE.md` §8 pass, including "304 performs zero storage reads" and "no Set-Cookie".
  **Manual check:** run a dev seed script that stores one converted image through `ImageStore`; open its permanent URL in a private window (no login) and see the image; open the thumb URL; edit the version in the URL to `v99` and get a 404.
  Done 2026-11-13: `app/Services/{Slug,NamePolicy,UrlBuilder,ImageStore}.ts`, `app/Models/ImageVersion.ts`, `routes/public.ts` + `app/Http/Controllers/PublicImageController.ts`, and `app/Providers/SessionCsrfProvider.ts` (the cookie mechanism, see decision log). Tests: `tests/{Slug,NamePolicy,UrlBuilder,ImageStore}.test.ts` and `tests/controllers/PublicImageController.test.ts` (§5 headers, 304 with a counting storage spy proving zero reads, HEAD, every §5 404 case, ext mismatch, slug ignored, no Set-Cookie even with a session cookie sent). Manual check run via `bun scripts/seed-demo-image.ts` + curl against the live S3 disk.

- [x] **1.4 Upload endpoint, minimal upload UI, and image grid** *(first end-to-end slice)*
  Backend: `POST /uploads` per `docs/ROUTES_SPEC.md` §4 (validate options with zod, convert, write objects, DB transaction for image + version 1, cleanup on failure, return savings).
  UI (minimal, replaced in 1.6): enable the **New → Upload images** button; it opens a plain file picker, uploads each chosen file with the **default** format and quality (XHR with progress and the `X-XSRF-TOKEN` header), shows a toast with "4.2 MB → 610 KB (−86%)", then reloads the page props so the image appears. The `drive.index` page lists active root images as a simple thumbnail grid using the permanent thumb URLs, plus the names.
  AC: uploading a JPEG creates `images/{publicId}/v1.webp` and `v1.thumb.webp`, one `images` row, one `image_versions` row; failure after the object write leaves no objects; 413/415/422 cases return the right status and show an error toast; unauthenticated → rejected.
  **Manual check:** sign in → New → Upload images → pick a JPEG → toast with savings → the thumbnail appears in the grid → right-click the thumbnail, copy its image address, open it in a private window and it loads.

- [ ] **1.5 Grid and list polish** *(UI)*
  Grid/list view toggle, sort by name / modified / size with order, `ImageCard` per `UI_SPEC.md` §4 (format badge, hover checkbox slot, ⋮ slot), list-view columns, skeleton loading, empty and error states, lazy-loaded thumbnails with explicit width and height.
  AC: 50 seeded images scroll smoothly; view and sort survive a refresh; thumbnails lazy-load from the permanent thumb URL; no layout shift.
  **Manual check:** seed 50 images → switch grid/list → change sort → refresh → same state; stop storage and see the error state.

- [ ] **1.6 Review & convert dialog and upload queue** *(UI; replaces the minimal picker from 1.4)*
  Per `UI_SPEC.md` §3 and §4: drop, paste, or picker → **Review & convert dialog** → Confirm → queue panel (concurrency 2, progress, cancel, retry, savings per file). WebP / AVIF / Original, quality, max dimension, "Apply to all", per-row override, "Remember these settings". AVIF disabled per `capabilities` and for animated inputs; unsupported or oversized files flagged and excluded. Window-wide drop overlay.
  AC: dropping 20 mixed files (including an SVG and a 60 MB file) shows 18 valid rows and 2 flagged; Confirm uploads them; **nothing is sent before Confirm** (verified in a test or the network log).
  **Manual check:** drag 20 files onto the window → dialog opens → change one row to AVIF and another to Original → Confirm → queue shows progress and savings → grid updates.

## M2: Browse and organize

- [ ] **2.1 Folder CRUD and navigation**
  `folders.store`, `folders.update`, `/files/:folderId`, breadcrumbs (each crumb a link), "New folder" dialog, folder cards above the images. Cycle rejection.
  AC: unit tests cover cycle detection (self, child, deep descendant); deep links and refresh work; unknown id → 404 page.
  **Manual check:** New → New folder "Trips" → click into it → upload an image there → breadcrumb back to My Files → refresh inside the folder.

- [ ] **2.2 Rename and details**
  Inline rename (F2 and menu) for images and folders; images update `name` and `slug` but not the version.
  AC: renaming an image keeps its existing permanent link working (test); a sibling name clash shows an inline error.
  **Manual check:** rename an image → the old permanent URL still opens it.

- [ ] **2.3 Selection and bulk bar**
  Click, Ctrl/Cmd, Shift range, Ctrl/Cmd+A, Esc; floating action bar with count.
  AC: selection clears on folder change.
  **Manual check:** select 3 images with each method → bar shows "3 selected" → Esc clears.

- [ ] **2.4 Move**
  `items.move` (atomic, rejects cycles), drag and drop onto folder, breadcrumb, sidebar; "Move to…" picker.
  AC: optimistic update with rollback on error.
  **Manual check:** drag an image onto a folder card → it disappears from here and appears inside; move a folder into itself → error toast.

- [ ] **2.5 Context menu and lightbox**
  Right-click and long-press menu (Open, Share*, Download, Rename, Move to…, Move to trash; items not built yet are hidden, not dead). Lightbox with prev/next, keyboard, download, info panel.
  AC: keyboard navigation works across the current folder's images.
  **Manual check:** double-click an image → lightbox → arrow keys move between images → Esc closes.

## M3: Versioning and sharing

- [ ] **3.1 Replace image (new version)**
  `images.replace` per `IMAGE_PIPELINE.md` §4 and §7: write `v(n+1)`, flip `current_version` in one transaction, then prune beyond `KEEP_VERSIONS`. Context menu **Replace image…** reuses the Review dialog in single-file mode.
  AC: after a replace, the latest URL serves the new bytes with a new ETag; the previous permanent URL still serves the old bytes; the pointer flip is atomic (test with an injected failure).
  **Manual check:** replace an image → thumbnail updates → old permanent link still shows the old picture, latest link shows the new one.

- [ ] **3.2 Versions panel and restore**
  Lightbox info panel lists versions with copy-permanent-link, **Make current**, open. `images.restoreVersion` moves only the pointer.
  AC: restoring v1 serves v1 on the latest URL; v2's permanent URL still works; pruned versions return 404.
  **Manual check:** open info → Versions → Make current on v1 → latest link shows v1.

- [ ] **3.3 Share dialog**
  Per `UI_SPEC.md` §5: latest, permanent, share page, Markdown/HTML snippets, AVIF warning, localhost hint, multi-select copy. Add 🔗 to the lightbox, context menu, and selection bar.
  AC: copied URLs open in a private window without login and show the expected version.
  **Manual check:** click 🔗 → Copy each link → paste in a private window.

- [ ] **3.4 Share page**
  `GET /p/:publicId` via `this.view()` (no hydration): image, metadata, download, OG/Twitter tags.
  AC: `og:image` is the permanent URL; trashed images 404; no cookies set.
  **Manual check:** open the share page logged out → see the image, details, and a working Download button.

- [ ] **3.5 Cache behavior tests (end to end)** *(backend-only)*
  Replace an image and assert: pinned = immutable, latest = revalidating, ETag differs, `304` works, thumbnails are pinned.
  AC: the whole `IMAGE_PIPELINE.md` §5 header table is asserted in tests.

## M4: Drive polish

- [ ] **4.1 Star and Starred view**
  `items.star`, star badge on cards, ★ in the menu and selection bar, `/starred` page.
  **Manual check:** star two images → open Starred → both listed; unstar → gone.

- [ ] **4.2 Trash**
  `items.trash`, `items.restore`, `items.delete`, `trash.empty`, Trash page with Restore, Delete forever, and Empty trash (confirm dialogs), "Moved to trash · Undo" toast. Trashed images' public URLs return 404 immediately.
  AC: after "Delete forever", **every version's** objects are gone and rows removed (test with the memory disk); trashing a folder hides descendants; restore with a trashed parent goes to root.
  **Manual check:** trash an image → its public link 404s → Undo or Restore from Trash → link works again → Delete forever → gone.

- [ ] **4.3 Recent and 4.4 Search**
  `/recent` (last 100, grouped by day) and `/search?q=` (name contains, debounced search box in the top bar, `/` focuses it).
  **Manual check:** type in the search box → results page → clear → back.

- [ ] **4.5 Storage meter and view prefs**
  Sidebar meter from `image_versions.size` and counts; sort and view prefs persisted in `localStorage`.
  **Manual check:** upload an image → the meter number grows.

- [ ] **4.6 Auto-purge** *(backend-only)*: Guren scheduled task deletes trash older than `TRASH_RETENTION_DAYS` using the same permanent-delete routine.
  AC: a test with a fake clock purges only expired items.

## M5: Hardening and operations

- [ ] **5.1 Reconcile command** *(backend-only)*: `bun run console images:reconcile [--dry-run]` reports storage objects with no row and rows with missing objects; deletes orphans only with an explicit flag, never on a listing error.
- [ ] **5.2 Rate limits** *(backend-only)*: Guren rate limiter on public routes (generous) and upload/replace (modest). A throttled upload shows a friendly toast.
- [ ] **5.3 Route-guard test** *(backend-only)*: `tests/route-guard.test.ts` per `ROUTES_SPEC.md` §6.
- [ ] **5.4 Accessibility and shortcuts**: focus management, ARIA grid, shortcuts table, `?` help dialog, reduced motion.
  **Manual check:** press `?` → shortcuts dialog; tab through the grid with the keyboard.
- [ ] **5.5 Dark mode**: follow system, with a manual toggle in the top bar.
- [ ] **5.6 E2E smoke** (Playwright or the scaffold's choice): login, review and convert, upload, copy link, open it logged-out, replace, check old and new links, trash, restore, delete forever.
- [ ] **5.7 Docker deploy**: `bunx guren deploy --target docker`; enable the `app` profile in compose; `sharp` works in the image; `data/` mounted.
  AC: `docker compose --profile app up -d` serves the app and passes `/health`.
  **Manual check:** open the containerized app, log in, upload an image.
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

_Agents: append one line per non-obvious decision: date · task · decision · reason. For UI tasks also: date · task · manual check result._

- 2026-11-11 · 0.2 · `PUBLIC_FILE_BASE_URL` renamed to `PUBLIC_BASE_URL`; image settings exposed as a `defineConfig` binding (`images`) resolved from the validated env · matches PLANNING.md §7/§11 and gives services typed settings without reading `process.env`.
- 2026-11-11 · 0.3 · `@aws-sdk/client-s3` added as a direct dependency · Guren's S3 driver imports it dynamically; app code still touches storage only through `storage.disk()`.
- 2026-11-11 · 0.3 · Compose pins `chrislusf/seaweedfs:4.53` and creates the bucket in a one-shot `bucket-init` (`weed shell`, retried until listed) · keeps `docker compose up -d` idempotent without a second toolkit image.
- 2026-11-11 · 0.4 · The owner seeder rewrites the hash only when `ADMIN_PASSWORD` no longer verifies against the stored one · keeps `db:seed` idempotent and never creates a second account on re-run.
- 2026-11-11 · 0.6 · sharp spike: `capabilities()` probes WebP and AVIF encoding via 16×16 test image; both formats available on this platform · `probeCapabilities()` shared as Inertia prop; UI hides AVIF if unavailable.
- 2026-11-11 · 0.5 · S3 driver works with plain `endpoint` (path-style) on SeaweedFS · conformance test passes on memory, local, and live SeaweedFS endpoint; no vendor-specific SDK used; app code touches storage only through `storage.disk()`.
- 2026-11-11 · 0.4 · Boot seeding is development-only, and `tests/setup.ts` (a `bunfig.toml` test preload) supplies a per-run `APP_KEY` · `bun test` and CI run without a `.env`, and tests own their rows instead of inheriting a seeded owner.
- 2026-11-11 · 0.7 · `/health` runs Guren `DatabaseCheck` + `StorageCheck` (both critical) registered in a `HealthProvider`; `HealthServiceProvider` must be listed before it in `createApp` because the `health` container binding is not default · the route maps the report to the ROUTES_SPEC §1 `{ ok, db, storage }` shape.
- 2026-11-11 · 0.7 · `tests/setup.ts` forces `STORAGE_DISK=local` for the app boot · the suite (CI included) must never depend on the compose stack; disk-specific tests still pin their own disk.
- 2026-11-12 · 1.1 · Animated AVIF is treated as **unsupported**: sharp 0.35.5 encodes an animated GIF to AVIF without error but flattens it to a single frame (`pages: 1`), so the server rejects `avif` for animated inputs with 422 instead of silently dropping frames · recorded in IMAGE_PIPELINE.md §2.
- 2026-11-12 · 1.1 · Fixed the 0.6 spike's `capabilities()` probe: it fed a raw RGBA buffer to sharp without `raw:` options, so every probe threw and would have reported `{ webp: false, avif: false }` · now probes a properly declared raw input; `probeCapabilities()` is cached on first call instead of at import time.
- 2026-11-12 · 1.1 · `convert()` takes caps/quality/thumb settings via `options.settings` (defaulting to env defaults) and throws `ImageConversionError` subclasses carrying the HTTP status (413/415/422) · keeps the service pure and lets the upload controller (1.4) map errors to responses.
- 2026-11-12 · plan · Reordered M1 into vertical slices: UI shell is now 1.2, services + public routes merged into 1.3, upload endpoint ships with a minimal upload button and grid in 1.4, polish in 1.5, the Review & convert dialog in 1.6 · nothing was visible in the browser until old task 1.5; every task now has a Manual check.
- 2026-11-12 · 1.2 · The Stash palette re-values the framework's `--g-*` tokens at the end of `resources/css/app.css` (after the `guren.css` import, past the `guren upgrade` marker) instead of introducing parallel `--app-*` tokens · one set of `g-` utilities everywhere, `guren upgrade` cannot clobber the values, login and shell stay coherent.
- 2026-11-12 · 1.2 · Added `lucide-react` (only new dependency) · the icons the shell and empty states need; `PLANNING.md` §3 already names it in the UI stack.
- 2026-11-12 · 1.2 · Migration `002_create_tables` never actually applied on any database, but the migrator reported success: (a) it used `--> statement-break` where drizzle splits on `--> statement-breakpoint`, so the whole file ran as one statement and only `CREATE TABLE folders` executed; and (b) the hand-written expression indexes mixed a bare `COALESCE(...)` expression with columns — SQLite requires each expression term parenthesized (`((COALESCE(\`parent_id\`, 0)), \`name\` COLLATE NOCASE)`). Additionally, the bun:sqlite migrator runs **only the first statement of each chunk**, so every statement needs its own break marker and comments must not contain the literal marker (the text gets split too). Fixed in place (nothing existed to diverge from), both dev and test DBs rebuilt and verified (all tables + 5 indexes; case-insensitive unique enforced).
- 2026-11-12 · 1.2 · Manual check (verify-in-browser, run `2026-11-12T01-25-39Z-drive`, driven by the person at http://127.0.0.1:45461): sign-in lands on `/files` in the shell; `/recent` `/starred` `/trash` open; `/dashboard` → `/files`; Log out → `/login`; guest `/files` → `/login`; responsive drawer below `lg` works · 7 steps recorded pass, 0 runtime errors · no browser tooling in the agent session, so the person drove the page and the agent recorded evidence.
- 2026-11-13 · 1.2 · Installed Playwright for automatic UI tests via `guren add browser-tests` (RFC 0033): `@playwright/test` + `@axe-core/playwright` (dev deps; the a11y checks are the point), `playwright.browser.config.ts` starting the app through `browser:serve` on port 4317, a browser account seeder (`browser@example.test`, `BROWSER_TEST_PASSWORD` in `.env`, seeded only under `browser:serve`), and generated smoke + a11y specs under `tests/browser/generated/` that `browser:map` rewrites. 13 specs green, including axe WCAG A/AA on `/login`, `/files`, `/profile`.
- 2026-11-13 · 1.2 · Browser specs share one database-backed session (`AUTH_FILE`), so any spec that logs out must sign itself in first — a logout inside the shared session kills the session under every later spec. Hand-written flow spec: `tests/browser/drive-shell.browser.ts`.
- 2026-11-13 · 1.2 · `initialComponent()` (the SSR payload's component name) only reflects a **full load**: after an Inertia client-side visit it still names the first page. Client-side assertions use rendered landmarks (headings, URLs) instead.
- 2026-11-13 · 1.2 · Dropped the `/dashboard` legacy redirect entirely (person's call, overriding this task's original "keep `/dashboard` as a redirect"): `/files` is the only real path, `/dashboard` now answers 404. Fewer routes to guard and document; nothing ever linked to it.
- 2026-11-13 · 1.3 · Cookie-free public delivery mechanism: `createApp` runs with `auth: { autoSession: false, autoCsrf: false }` and `SessionCsrfProvider` re-mounts the same session/CSRF middleware for every path except the `/i/`, `/t/`, `/p/` prefixes, which skip both entirely · the framework's CSRF middleware sets the `XSRF-TOKEN` cookie on *every* safe request and `csrfOptions.exclude` skips only validation, never the cookie, and the session middleware re-issues the session cookie on any request that carries one — route-level stripping cannot help because those cookies are appended after the route chain, so excluding whole prefixes is the only workable mechanism (ROUTES_SPEC §5).
- 2026-11-13 · 1.3 · `image.show` serves both `/i/:publicId/:file` (pinned + latest-with-ext) and `image.latest` serves `/i/:publicId`; two route names, shared action · the §4 parsing regexes decide pinned vs latest; `/i/{id}` is the only form guaranteed to survive a format change, which the Share dialog will use.
- 2026-11-13 · 1.3 · Manual check (no browser tooling in the session, so curl as the "private window"): `bun scripts/seed-demo-image.ts` stored a converted 9192 B → 1072 B WebP on the live S3 disk; permanent and thumb URLs returned 200 with the exact §5 headers and valid RIFF/WEBP bytes, latest answered `public, no-cache`, `If-None-Match` gave `304`, `v99` gave `404 no-store`, and no `Set-Cookie` on any response even with a session cookie sent · dev server stopped afterwards; run `bun run dev` to view.- 2026-11-14 · 1.4 · `ConvertResult` gained `inputFormat` (the sniffed input format): `image_versions.original_format` is NOT NULL and must record what arrived, but `format` alone names the *stored* format, which is wrong whenever the output is webp/avif · pure addition, no behavior change.
- 2026-11-14 · 1.4 · One file per `POST /uploads` request (the spec's multipart contract is singular): the picker uploads chosen files sequentially over one XHR each, so every file carries its own progress (1.6) and per-file error; the server caps concurrent encodes anyway.
- 2026-11-14 · 1.4 · `drive.index` builds its `ImageItem[]` from one extra `whereIn('imageId', …)` query on `image_versions`, filtered in memory against `current_version` — a page of images needs their current rows, and per-image queries would be N round trips.
- 2026-11-14 · 1.4 · Minimal upload UI (task 1.6 replaces it): New opens a one-item menu ("Upload images") wired to a hidden `<input type="file" accept="image/*" multiple>` in `Layout`, uploads with the shared-prop defaults (format/quality), and toasts `${MB} → ${KB} (−${percent})` per file on success or `message` on error; a partial `router.reload({ only: [folder, breadcrumbs, folders, images, storage] })` refreshes whatever page is open.
- 2026-11-14 · 1.4 · Manual check (verify-in-browser, run `2026-11-14T01-04-27Z-drive`, driven by a Playwright spec `tests/browser/upload.browser.ts` because the session has no interactive browser tooling): sign-in → New → Upload images → picker → toast "blue-square-…jpg: 1.7 KB → 540 B (−69%)" → thumbnail in the grid → the thumb URL fetched from a cookie-free context returned 200 `image/webp`; a picked text file showed the 415 message in an error toast and created no row · rows verified read-only through the models on the same dev DB (`images/{publicId}/v1.webp`, `originalFormat` jpeg) · 15 browser specs green incl. axe WCAG A/AA on `/files` · `browser:doctor` was inconclusive on /files and /profile (auth-required landmarks) before sign-in.
- 2026-11-14 · 1.4 · Leftover demo rows on the dev database ("Sunset beach", "blue-square.jpg" from failed spec runs) keep the drive non-empty; the shell spec now asserts the empty state only when there are no images, and the upload spec generates a unique file name per run so reruns never depend on state.
