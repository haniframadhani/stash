# PLANNING.md: Stash

A single-user, self-hosted, Google Drive-style manager for images, stored in any S3-compatible bucket. Built as **one Guren monolith** (Bun).

> Reading order: this file → `AGENTS.md` → `TASKS.md`. Details: `docs/IMAGE_PIPELINE.md`, `docs/ROUTES_SPEC.md`, `docs/UI_SPEC.md`.

---

## 1. Goals and non-goals

**Goals**
- Drive-like UI: folders, breadcrumbs, grid and list, drag-and-drop upload, lightbox, star, trash, search.
- **Public, stable, shareable image links.** Anyone with a link can view an image. No login needed.
- **Authorized writes.** Create, update, and delete require the owner to be signed in.
- **Convert before upload.** Every upload goes through a *Review & convert* step: choose AVIF or WebP (or keep the original), quality, and max size, then confirm.
- **Versioned file names.** URLs carry a version (`sunset.v3.avif`), so caches never serve a stale image.
- **Storage-agnostic.** Works with SeaweedFS, MinIO, Garage, Cloudflare R2, AWS S3, or a local folder, by changing env vars only.
- Runs locally with `docker compose` plus `bun run dev`. Zero database server (SQLite).

**Non-goals (v1)**
- Multi-user, registration, roles, sharing permissions, per-image privacy.
- Non-image files (documents, video). Images only.
- On-the-fly resizing (`?w=400`), CDN logic, AI tagging, OCR.
- Replacing the storage backend's own admin UI.

---

## 2. Requirement traceability

| Requirement | How it is met |
|---|---|
| Single user only | `guren make:auth --minimal`: login only, **no register route**. One user is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| Local hosting, spin up anything | `docker-compose.yml` (storage + one-shot bucket init, optional app container). Dev runs on the host. |
| SQLite, no DB server | Guren's default SQLite via Drizzle (`./data/*.db`). Sessions are DB-backed in the same file. |
| Easy to share link | Share dialog: latest link, permanent link, share page, Markdown and HTML snippets. Absolute URLs use `PUBLIC_BASE_URL`. |
| Create / update / delete authorized | Every non-GET route sits inside the `auth` middleware group. A test enforces it (`AGENTS.md`). |
| Read not authorized | `GET /i/*`, `/t/*`, `/p/*` are public. Browsing and listing in the manager UI still require login (see §9). |
| Convert to AVIF or WebP, with confirm | Review & convert dialog (UI), `sharp` pipeline (server). See `docs/IMAGE_PIPELINE.md`. |
| File name versioning | `{slug}.v{n}.{ext}` immutable URLs, plus a revalidating "latest" URL. See §7. |
| Guren is *the* framework | One Guren app, one process, one repo. No second web framework. See §3. |
| Not tied to SeaweedFS | Storage accessed only through Guren's `StorageManager` S3 driver (`endpoint`). See §10. |

---

## 3. Stack and guardrails

**Stack**
- **Guren v2** on **Bun**: routes, controllers, middleware, validation, sessions, CSRF, auth, storage, scheduling, testing (`TestApp`).
- **Inertia.js + React** (Guren's default) for the UI. SSR mode is fine. Server-rendered `this.view()` for the public share page.
- **Drizzle ORM + SQLite** through Guren models.
- **sharp** for AVIF and WebP encoding (see D4).
- **Tailwind CSS + shadcn/ui + lucide-react** for the UI. Check whether the scaffold already includes Tailwind; add it only if missing.
- **zod** for validation (Guren's validators). **bun test** for tests.

**Guardrails: one coherent monolith**
- Guren is the only framework. Do **not** add or import Elysia, Next.js, Express, Fastify, or Hono directly. Guren runs on Hono internally, so use Guren's router, middleware, and controller APIs and never reach past them.
- No second server process, no separate API service, no custom `Bun.serve` beside Guren.
- No AWS SDK or vendor-specific SDK in app code. Storage goes through `storage.disk()`.
- No separate state library. Inertia props are the server state (`router.reload({ only })`, partial reloads).

---

## 4. Key decisions

**D1. SQLite is the source of truth for names and structure; storage holds bytes only.** Object keys are opaque (`images/{publicId}/v{n}.{ext}`). Rename, move, star, and trash are DB-only. Trade-off: browsing the bucket directly shows IDs, not folders. Accepted.

**D2. Serve images through the app, not from a public bucket.** The bucket stays private. `GET /i/...` reads from storage and streams bytes with strong cache headers. This works on every S3-compatible backend (no bucket policy, no CORS, no backend-specific anonymous-read setup) and keeps one URL scheme. If bandwidth ever matters, put a CDN or Cloudflare in front of `/i/*`; the immutable URLs are designed for it.

**D3. Do not use Guren's Attachments layer.** It ties files to models polymorphically and serves private disks through expiring signed URLs. Stash needs permanent public links, custom versioned names, and folders, so we use `StorageManager` directly plus our own `images` and `image_versions` tables. Revisit only if the data model changes.

**D4. `sharp` for conversion, not `Bun.Image`.** `Bun.Image` encodes WebP everywhere but its AVIF support depends on the OS: unavailable on Linux, and AVIF *encoding* on macOS needs Apple Silicon M3 or newer. `sharp` ships its own encoders. The app probes capabilities at boot; if AVIF is unavailable the UI hides it.

**D5. Immutable versioned URLs plus a "latest" URL.** A given `(publicId, version)` never changes content, so it is cached forever. The "latest" URL always revalidates. Replacing an image creates version N+1; it never overwrites.

**D6. Conversion is synchronous in v1.** It runs in the upload request with a small concurrency limit (default 2). Moving it to a Guren queue worker is a backlog item.

**D7. Public reads, private management.** Image bytes and the share page are public to anyone with the (unguessable) link. Listing, search, and folders need login.

---

## 5. Architecture

```
Browser ── Inertia/React pages ───────────────┐
Anyone  ── GET /i/…  /t/…  /p/…  (public) ────┤
                                              ▼
                      Guren app (single Bun process)
   ┌───────────────────────────────────────────────────────────┐
   │ routes/ → controllers → services → models (Drizzle)       │
   │   services: ImageConverter(sharp) · ImageStore · UrlBuilder│
   └──────────────┬─────────────────────────────┬──────────────┘
                  ▼                             ▼
         SQLite (./data/…db)        StorageManager "s3" disk ──► any S3-compatible
         users, sessions,                                         (SeaweedFS, MinIO,
         folders, images,                                          Garage, R2, S3…)
         image_versions                       or "local" disk (dev, no S3)
```

---

## 6. Data model (Drizzle, SQLite)

Shapes are authoritative; write them in `db/schema.ts` and generate migrations. Timestamps follow the scaffold's convention (`integer`, `timestamp_ms`).

```
users            (from make:auth --minimal)  id, name, email, password_hash, remember_token, timestamps
sessions         (from make:auth)            DB-backed sessions

folders
  id            integer pk
  parent_id     integer null → folders.id          (null = root)
  name          text not null
  created_at, updated_at
  deleted_at    integer null                        (soft delete)

images
  id              integer pk
  public_id       text not null UNIQUE               -- 12-char base62, random, used in URLs
  folder_id       integer null → folders.id
  name            text not null                      -- display name, no extension ("Sunset beach")
  slug            text not null                      -- derived from name, cosmetic in URLs
  current_version integer not null                   -- points at image_versions.version
  starred         integer not null default 0
  created_at, updated_at
  deleted_at      integer null

image_versions
  id              integer pk
  image_id        integer not null → images.id
  version         integer not null                   -- 1, 2, 3 … UNIQUE(image_id, version)
  format          text not null                      -- 'avif' | 'webp' | 'jpeg' | 'png' | 'gif'
  mime            text not null
  ext             text not null
  size            integer not null                   -- stored bytes
  width, height   integer not null
  sha256          text not null                      -- of stored bytes, drives ETag
  storage_key     text not null                      -- images/{public_id}/v{version}.{ext}
  thumb_key       text not null                      -- images/{public_id}/v{version}.thumb.webp
  original_name   text not null                      -- uploaded file name
  original_format text not null
  original_size   integer not null
  convert_options text not null                      -- JSON: {format, quality, maxDimension}
  created_at

-- Unique names among active siblings (case-insensitive). COALESCE handles NULL parents.
UNIQUE INDEX uq_folders_name ON folders (COALESCE(parent_id,0), name COLLATE NOCASE) WHERE deleted_at IS NULL
UNIQUE INDEX uq_images_name  ON images  (COALESCE(folder_id,0), name COLLATE NOCASE) WHERE deleted_at IS NULL
```
If Drizzle cannot express the partial or expression indexes, add them in a hand-written SQL migration.

**Trash rules**
- Trashing a folder sets `deleted_at` on that folder only. Descendants are hidden because an ancestor is trashed (recursive CTE). They are not listed separately in Trash.
- Restore clears `deleted_at`. If the parent is trashed or missing, the item goes to root. Name clashes get a ` (1)` suffix.
- Public URLs of trashed images return **404** immediately.
- Permanent delete removes **all versions'** objects (original and thumb), then rows.
- Auto-purge after `TRASH_RETENTION_DAYS` (default 30) via a Guren scheduled task.

---

## 7. URLs, versioning, caching (summary)

Full rules in `docs/IMAGE_PIPELINE.md`.

| Purpose | URL | Cache |
|---|---|---|
| **Permanent** (pinned to a version) | `/i/{publicId}/{slug}.v{n}.{ext}` | `public, max-age=31536000, immutable` |
| **Latest** (always current) | `/i/{publicId}/{slug}.{ext}` (or `/i/{publicId}`) | `public, no-cache` + ETag → `304` |
| Thumbnail (pinned) | `/t/{publicId}/{slug}.v{n}.webp` | immutable |
| Share page (HTML, OG tags) | `/p/{publicId}` | `no-cache` |

- The `{slug}` segment is cosmetic and ignored on lookup, so renaming never breaks a link.
- Replace → version `n+1`. Old versions are kept (`KEEP_VERSIONS`, default 5) so shared permanent links keep working, then pruned oldest-first.
- Public image responses must carry **no `Set-Cookie`** (it defeats shared caches). Mount them so session and CSRF middleware do not attach cookies, and test it.

---

## 8. Upload flow

1. User drops or picks files → **Review & convert dialog** (nothing uploaded yet): per-file preview, format (WebP / AVIF / Original), quality, max dimension, destination folder, "Apply to all".
2. **Confirm** → client uploads each file (multipart + options) with a concurrency of 2.
3. Server: size and pixel caps → sniff with sharp → auto-rotate → optional resize → encode → strip metadata (EXIF and GPS) → build thumb → sha256 → write objects → DB transaction (image + version 1).
4. Response includes the saved bytes, so the dialog can show "4.2 MB → 610 KB (−86%)".
5. Failure after an object write → delete the orphaned objects. Never leave orphans.

The original is **not stored** unless the user picks "Original". The dialog says so.

---

## 9. Auth model

- **Public (no auth):** `GET /i/*`, `GET /t/*`, `GET /p/:publicId`, `GET /health`, `GET /login`.
- **Everything else requires login:** all pages (`/files`, `/recent`, `/starred`, `/trash`, `/search`) and **every** `POST`, `PATCH`, `DELETE`.
- Sessions in SQLite, CSRF on (Guren `auth: {}`), login throttling from the generated `AuthThrottle`.
- Read-without-auth means anyone with a link sees the image. IDs are random (about 71 bits), but treat uploads as **unlisted-public**, not secret.
- To make the listing public instead, move the browse routes out of the `auth` group. Nothing else changes.

---

## 10. Storage portability

Application code touches storage only through `storage.disk()` (`put`, `get`, `exists`, `delete`, `deleteMany`, `metadata`). Never use backend-specific APIs (no SeaweedFS filer calls, no presign assumptions).

Sketch of `config/storage.ts` (confirm against the output of `bunx guren add storage`):

```ts
export default defineStorageConfig((env) => {
  const disks: Record<string, DiskConfig> = {
    // Private local disk: dev without any S3. Must NOT be under public/.
    local: { driver: 'local', root: './storage/app', visibility: 'private' },
  }
  if (env.S3_BUCKET) {
    disks.s3 = {
      driver: 's3',
      bucket: env.S3_BUCKET,
      region: env.S3_REGION ?? 'us-east-1',
      endpoint: env.S3_ENDPOINT,          // e.g. http://localhost:8333 — this is what makes it portable
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      acl: false,                          // most S3-compatibles do not implement object ACLs
      visibility: 'private',
    }
  }
  if (!Object.hasOwn(disks, env.STORAGE_DISK)) throw new Error(`Unknown STORAGE_DISK=${env.STORAGE_DISK}`)
  return { default: env.STORAGE_DISK, disks }
})
```

| Backend | `S3_ENDPOINT` | Notes |
|---|---|---|
| SeaweedFS | `http://localhost:8333` | Default in `docker-compose.yml`. Bucket must be created (init container does it). |
| MinIO | `http://localhost:9000` | Commented example in compose. Create the bucket in its console. |
| Garage | `http://localhost:3900` | Region usually `garage`. |
| Cloudflare R2 | `https://<acct>.r2.cloudflarestorage.com` | Region `auto`, `acl: false`. |
| AWS S3 | (omit) | Real region. |
| Local folder | n/a | `STORAGE_DISK=local`. |

**Conformance test:** one test file runs the same put/get/exists/delete/metadata checks against the configured disk. It must pass on `memory`, `local`, and the live S3 endpoint (opt-in via `RUN_S3_TESTS=1`). That is the guarantee against vendor lock-in.

Backends differ in path-style vs virtual-host addressing; task 0.5 verifies the S3 driver works with a plain `endpoint` against SeaweedFS and MinIO and records the result.

---

## 11. Local hosting and sharing

- `docker compose up -d` starts storage and creates the bucket. `bun run dev` runs the app on `http://localhost:3333`.
- Production-ish: `docker compose --profile app up -d` runs the app container (Dockerfile from `bunx guren deploy --target docker`).
- **Sharing beyond your LAN:** the app must be reachable. Use Cloudflare Tunnel, Tailscale Funnel, or a reverse proxy with HTTPS, then set `PUBLIC_BASE_URL` so copied links are correct.
- **Back up both** the `data/` folder (SQLite) and the storage volume or bucket. Losing either breaks the app.

---

## 12. Project structure (adapt to what the scaffold generates)

```
stash/
├── PLANNING.md  AGENTS.md  TASKS.md  docs/
├── docker-compose.yml  .env.example
├── config/            env.ts  storage.ts  images.ts
├── db/                schema.ts  migrations/  seeders/
├── routes/            web.ts (private)  public.ts (image + share routes)
├── app/
│   ├── Http/Controllers/   Drive · Folder · Image · Upload · Item · Trash · PublicImage · SharePage · Auth/*
│   ├── Models/             Folder · Image · ImageVersion · User
│   ├── Services/           ImageConverter · ImageStore · UrlBuilder · NamePolicy · Slug
│   └── Providers/          ImageProvider (binds services)
├── resources/js/
│   ├── pages/              drive/* · auth/Login
│   └── components/         ui/ (shadcn) · drive/ (FileGrid, ReviewDialog, ShareDialog, …)
└── tests/
```

---

## 13. Milestones (summary)

| # | Milestone | Outcome |
|---|---|---|
| M0 | Foundation | Scaffold, single-user auth, schema, storage contract, sharp spike, compose |
| M1 | Upload, convert, serve | Review & convert → stored versioned image → public URL works with correct caching |
| M2 | Browse and organize | Grid and list, folders, rename, move, selection, context menu, lightbox |
| M3 | Versioning and sharing | Replace image, versions panel, share dialog, share page, cache tests |
| M4 | Drive polish | Star, trash and restore, recent, search, sort, storage meter, auto-purge |
| M5 | Hardening | Reconcile command, rate limits, a11y, shortcuts, dark mode, e2e, Docker deploy, README |

Checklist with acceptance criteria: `TASKS.md`.

---

## 14. Risks and open questions

- **`sharp` under Bun:** believed to work with prebuilt binaries, but verify in task 0.6 on the real target (Docker image included). Fallback: WebP-only via `Bun.Image`, AVIF hidden.
- **AVIF encode cost:** slow on large photos. Default is WebP; AVIF is opt-in with a lower effort setting and a concurrency cap.
- **AVIF compatibility:** some chat apps, email clients, and older viewers cannot display AVIF. The share dialog warns, and WebP is the default.
- **Guren cookie behavior on public routes:** the session and CSRF middleware may set cookies on GETs. Verify and fix in task 1.3.
- **Memory use:** `disk.get()` returns a whole `Buffer`. Fine for converted images (small). Revisit if streaming becomes available or needed.
- **S3 addressing differences:** see §10; handled in task 0.5.
- **Orphans and drift:** a `images:reconcile` command (M5) reports objects with no row and rows with no object.
- **HEIC input:** not supported by the default `sharp` build. Rejected with a clear message in v1.

---

## 15. Definition of done (v1)

- Fresh clone → `cp .env.example .env`, `docker compose up -d`, `bun install`, `bun run db:migrate && bun run db:seed`, `bun run dev` works.
- Sign in, drop 20 photos, review and convert to WebP, confirm, and all appear with thumbnails; savings are shown.
- A copied permanent link opens in a private window without login; the latest link updates after a replace while the permanent link still shows the old version.
- Public image responses: correct `Content-Type`, `ETag`, cache headers, `304`, no `Set-Cookie`.
- Unauthenticated `POST/PATCH/DELETE` to every mutating route is rejected. Verified by test.
- Swapping `S3_ENDPOINT` and credentials to a different backend works with no code change; the conformance test passes.
- `bun run typecheck`, `bun test`, and `bunx guren gate` are green.