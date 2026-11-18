# Stash

A single-user, Drive-style image manager: upload, convert, organize, version and share images. One Guren (Bun, TypeScript) monolith, SQLite for metadata, any S3-compatible bucket for image bytes.

The app itself is **local and never exposed to the internet**. Shared links are served by the bucket's public domain, so they keep working while this machine is off (`PLANNING.md` §9, §11).

## Quick start

No S3 service needed — the local disk is the default.

```bash
bun install
cp .env.example .env          # set APP_KEY (and ADMIN_EMAIL / ADMIN_PASSWORD)
bun run db:migrate && bun run db:seed
bun run dev                   # http://localhost:3333
```

Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you seeded. `bun run db:make` generates a migration after you edit `db/schema.ts`.

Docker:

```bash
docker compose up -d --build                    # http://<host>:${APP_PORT:-3333}
```

`docker-compose.yml` reads `.env`, runs `db:migrate && db:seed --force` once, keeps SQLite in the `stash-data` volume, and holds **no S3 service**. Development with a bundled SeaweedFS is a separate stack:

```bash
docker compose -f docker-compose.dev.yml up -d --build   # app on :3334, SeaweedFS on :8333
```

Its data is bind-mounted (`./data`, `./storage/app`, `./volumes/seaweedfs`), so it survives `down` and is visible on the host.

## Environment reference

Every variable is declared and validated in `config/env.ts`; boot fails on a bad value. `.env.example` documents the same set.

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `Guren` | Display name |
| `APP_KEY` | — (required in production) | Root secret for signing and encryption |
| `APP_URL` | — (required in production) | Base URL the host answers to |
| `PORT` / `HOST` | `3333` / `0.0.0.0` | Listen address |
| `APP_PORT` | `3333` | Host port only (compose); the container always listens on `3333` |
| `DATABASE_URL` | driver default (`./data/guren.db`) | SQLite file path |
| `TEST_DATABASE_URL` | `./data/guren.test.db` | SQLite file used by `bun test` |
| `SESSION_DRIVER` | `database` | `database`, `memory` or `cookie` |
| `STORAGE_DISK` | `local` | `local` (a folder) or `s3` (any S3-compatible endpoint) |
| `S3_ENDPOINT` | — | e.g. `http://localhost:8333` (SeaweedFS), R2 `https://<acct>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | — | Bucket name; required when `STORAGE_DISK=s3` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | — | Bucket credentials |
| `S3_REGION` | `us-east-1` | `auto` for R2, `garage` for Garage |
| `PUBLIC_FILES_BASE_URL` | — | Public origin serving the bucket. **Unset = sharing off**; the UI falls back to the private `/preview` route |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Seeded owner account (only the password hash is stored) |
| `MAX_UPLOAD_MB` | `50` | Per-file size cap (413 above it) |
| `MAX_PIXELS` | `100000000` | Decoded pixel cap (422 above it) |
| `CONVERT_CONCURRENCY` | `2` | Simultaneous encodes |
| `KEEP_VERSIONS` | `5` | Versions kept per image, oldest pruned first |
| `DEFAULT_FORMAT` | `webp` | Preselected format in Review & convert |
| `DEFAULT_QUALITY_WEBP` / `DEFAULT_QUALITY_AVIF` | `80` / `55` | Encoder quality |
| `AVIF_EFFORT` | `4` | sharp effort for AVIF (0–9) |
| `TRASH_RETENTION_DAYS` | `30` | Days before the purge deletes trashed items |
| `BROWSER_TEST_PASSWORD` | — | Password for the Playwright test account |

## Swapping storage backends

Image bytes only reach storage through Guren's `StorageManager` (`config/storage.ts`); no app code calls a backend API. Changing backends is env-only:

| Backend | `STORAGE_DISK` | `S3_ENDPOINT` | Notes |
|---|---|---|---|
| Local folder | `local` | — | Default; `./storage/app`, no S3 needed |
| SeaweedFS | `s3` | `http://localhost:8333` | What `docker-compose.dev.yml` runs (`my-bucket`) |
| MinIO | `s3` | `http://localhost:9000` | Create the bucket in its console |
| Garage | `s3` | `http://localhost:3900` | Region usually `garage` |
| Cloudflare R2 | `s3` | `https://<acct>.r2.cloudflarestorage.com` | Region `auto`, `acl: false` |
| AWS S3 | `s3` | omit | Real region |

Verify the target endpoint before trusting it:

```bash
bun run storage:check
RUN_S3_TESTS=1 bun test tests/storage-contract.test.ts   # same put/get/exists/delete/metadata checks
```

Existing objects do not travel with the env change: copy them with the provider's tooling or keep the old disk configured while you move them.

## Sharing beyond the LAN

The app is not a public service — do not open a tunnel or reverse proxy for it. Share the bucket instead:

1. Give the bucket a public custom domain (Cloudflare R2 custom domain for R2) and set `PUBLIC_FILES_BASE_URL` to it, e.g. `https://img.example.com`.
2. On that domain add two rules (`docs/IMAGE_PIPELINE.md` §5):

```
# Cache rule, path images/*
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff

# Block rule, path /trash/*
→ 404
```

3. Restart the app (env is read at boot). Every copied link is now `{PUBLIC_FILES_BASE_URL}/images/{publicId}/v{n}.{ext}` — a permanent, immutable object URL that opens with the app and this machine off.

The first rule can serve a year from cache; purge a URL on Cloudflare if a takedown must land before the edge TTL expires. Without the block rule, trashing would move bytes to `trash/` and they would still be readable. Unset `PUBLIC_FILES_BASE_URL` and the Share dialog says sharing is off rather than handing out `localhost` links.

## Backups

Two things hold all state; back up both or a restore is useless.

| What | Where | Contains |
|---|---|---|
| SQLite | `data/stash.db` (`DATABASE_URL`) — `stash-data` volume in production compose | Images, folders, versions, sessions, users |
| Image bytes | the bucket (`S3_BUCKET`), or `./storage/app` when `STORAGE_DISK=local` — `stash-storage` volume in compose | Every version and thumbnail object, live and under `trash/` |

**SQLite**, consistent without stopping the app:

```bash
sqlite3 data/stash.db ".backup '/backups/stash-$(date +%F).db'"   # online backup, safe under WAL
```

Or reach the file inside the named volume: `docker compose run --rm -v "$PWD/backups:/out" app cp /app/data/stash.db /out/`.

**Bucket**, mirror the whole prefix including `trash/`:

```bash
rclone sync r2:my-bucket ./backups/bucket --fast-list
# local disk instead:
tar czf ./backups/storage-app-$(date +%F).tgz storage/app
```

Restore: stop the app, put the `.db` file back at `DATABASE_URL`, sync the objects back to the same bucket (or the same `storage/app`), then start. Keys are stable, so a database and bucket from the same night line up; restore a database older than the objects and the extra objects are simply unreferenced (`images:reconcile` reports them).

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Dev server with Vite and codegen (`:3333`) |
| `bun run build` | Build for production |
| `bun run start` / `bun run preview` | Run the built app (`NODE_ENV=production`) |
| `bun run db:make` | Generate a migration from `db/schema.ts` |
| `bun run db:migrate` / `db:status` / `db:reset` / `db:seed` | Database workflow |
| `bun run codegen` | Regenerate route/page types |
| `bun run typecheck` / `bun run lint` / `bun run test` | Checks |
| `bun run test:browser` | Playwright specs |
| `bun run storage:check` | Probe the configured disk |
| `bunx guren gate` | Every CI stage; exit 0 = done |

## Docs

`PLANNING.md` (decisions), `TASKS.md` (checklist), `docs/IMAGE_PIPELINE.md` (pipeline, keys, URLs, cache rules), `docs/ROUTES_SPEC.md`, `docs/UI_SPEC.md`, `docs/adr/`.
