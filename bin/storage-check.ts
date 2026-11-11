import { StorageManager } from '@guren/core'
import env from '../config/env.js'
import storageConfig from '../config/storage.js'

// Proves the configured disk round-trips bytes without involving the app or
// the database: run it after changing storage env, e.g.
//   STORAGE_DISK=local bun run storage:check
//   STORAGE_DISK=s3 bun run storage:check
const { values } = env.parse()
const config = storageConfig.resolve(values)
const diskName = config.default ?? 'default'
const disk = new StorageManager(config).disk()
const key = `healthcheck/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.bin`
const body = Buffer.from(`stash storage round-trip ${new Date().toISOString()}`)

try {
  await disk.put(key, body, { contentType: 'application/octet-stream' })

  const read = await disk.get(key)
  if (!read?.equals(body)) throw new Error(`get(${key}) did not return the bytes that were put`)
  if (!(await disk.exists(key))) throw new Error(`exists(${key}) is false after put`)

  const metadata = await disk.metadata(key)
  if (metadata?.size !== body.length) {
    throw new Error(`metadata(${key}).size is ${metadata?.size ?? 'missing'}, not ${body.length}`)
  }
  // The local driver has no per-object content type; only backends that store
  // one are held to it here.
  if (metadata.contentType !== undefined && metadata.contentType !== 'application/octet-stream') {
    throw new Error(`metadata(${key}).contentType is ${metadata.contentType}, not application/octet-stream`)
  }

  await disk.delete(key)
  if (await disk.exists(key)) throw new Error(`exists(${key}) is true after delete`)

  console.log(`storage:check ok on disk "${diskName}"`)
} catch (error) {
  // Leave nothing behind even when the round-trip failed halfway.
  await disk.delete(key).catch(() => false)
  console.error(`storage:check failed on disk "${diskName}":`, error instanceof Error ? error.message : error)
  process.exit(1)
}
