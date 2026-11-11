import { randomBytes } from 'node:crypto'

// Session cookies are signed with APP_KEY, so the app cannot boot without one.
// CI and a fresh checkout have no .env; a per-run key keeps tests self-contained
// and never weakens a real deployment, which sets its own.
process.env.APP_KEY ??= `base64:${randomBytes(32).toString('base64')}`
