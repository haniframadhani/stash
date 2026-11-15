import { defineEnv, Env, type InferEnv } from '@guren/core'
import { z } from 'zod'

/** Integer env value with a lower bound (and optional upper bound), so a typo fails boot. */
const intInRange = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  Env.custom(z.coerce.number().int().min(min).max(max))

const env = defineEnv({
  BROWSER_TEST_PASSWORD: Env.string().optional().secret(),
  SESSION_DRIVER: Env.enum(['database', 'memory', 'cookie']).default('database')
    .describe('Where sessions live: database (the sessions table), memory (single process) or cookie.'),
  APP_NAME: Env.string().default('Guren'),
  APP_KEY: Env.string().secret().requiredInProduction()
    .describe('Root secret for signing and encryption; each use derives its own key.'),
  APP_URL: Env.url().requiredInProduction()
    .describe('Public base URL. Production host authorization answers only to its hostname.'),
  PORT: Env.port().default(3333),
  HOST: Env.string().default('0.0.0.0'),
  // config/database.ts carries the fallbacks, which differ per driver.
  DATABASE_URL: Env.string().optional(),
  TEST_DATABASE_URL: Env.string().optional()
    .describe('Read under NODE_ENV=test by the SQLite driver only.'),

  // Storage: only these keys decide where image bytes live (PLANNING.md §10).
  STORAGE_DISK: Env.enum(['local', 's3']).default('local')
    .describe('Disk that holds image objects: local (a folder) or s3 (any S3-compatible endpoint).'),
  S3_ENDPOINT: Env.url().optional()
    .describe('S3-compatible endpoint, e.g. http://localhost:8333 for SeaweedFS.'),
  S3_ACCESS_KEY_ID: Env.string().optional(),
  S3_SECRET_ACCESS_KEY: Env.string().secret().optional(),
  S3_BUCKET: Env.string().optional(),
  S3_REGION: Env.string().optional(),
  PUBLIC_BASE_URL: Env.url().optional()
    .describe('Absolute base for copied share links; APP_URL when unset.'),

  // Single seeded owner (PLANNING.md §9). Read by the seeder only.
  ADMIN_EMAIL: Env.custom(z.email()).optional()
    .describe('Email of the seeded owner account.'),
  ADMIN_PASSWORD: Env.string().secret().optional()
    .describe('Password of the seeded owner account; only its hash is stored.'),

  // Image pipeline (docs/IMAGE_PIPELINE.md §1 to §2).
  MAX_UPLOAD_MB: intInRange(1).default(50)
    .describe('Per-file encoded input size cap; larger uploads get 413.'),
  MAX_PIXELS: intInRange(1).default(100_000_000)
    .describe('Decoded pixel cap, a decompression-bomb defense; larger images get 422.'),
  CONVERT_CONCURRENCY: intInRange(1).default(2)
    .describe('Maximum simultaneous encodes; the rest wait in a semaphore.'),
  KEEP_VERSIONS: intInRange(1).default(5)
    .describe('Versions kept per image, oldest pruned first.'),
  DEFAULT_FORMAT: Env.enum(['webp', 'avif', 'original']).default('webp')
    .describe('Format preselected in the Review & convert dialog.'),
  DEFAULT_QUALITY_WEBP: intInRange(1, 100).default(80),
  DEFAULT_QUALITY_AVIF: intInRange(1, 100).default(55),
  AVIF_EFFORT: intInRange(0, 9).default(4)
    .describe('sharp effort for AVIF (0 to 9); lower is faster.'),

  // Trash (PLANNING.md §6).
  TRASH_RETENTION_DAYS: intInRange(0).default(30)
    .describe('Days a trashed item stays before the scheduled purge deletes it.'),
})

export default env

declare module '@guren/core' {
  interface AppEnv extends InferEnv<typeof env> {}
}
