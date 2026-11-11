import { randomBytes } from 'node:crypto'

// Session cookies are signed with APP_KEY, so the app cannot boot without one.
// CI and a fresh checkout have no .env; a per-run key keeps tests self-contained
// and never weakens a real deployment, which sets its own.
process.env.APP_KEY ??= `base64:${randomBytes(32).toString('base64')}`

// The suite must not depend on the compose stack: a local .env can point
// STORAGE_DISK at the S3 endpoint, which is unreachable in CI and whenever
// docker is down. Tests that exercise a specific disk set it themselves
// (storage-contract.test.ts); this pins the app boot itself to the offline
// local disk so /health's storage probe answers from the filesystem alone.
process.env.STORAGE_DISK = 'local'
