import { beforeAll, describe, it } from 'bun:test'
import { ambientContainer, type StorageManager } from '@guren/core'
import { TestApp } from '@guren/testing'
import app from '../src/app.js'

// /health probes the real SQLite connection and the configured storage disk
// (app/Providers/HealthProvider.ts). The storage check is exercised for real
// on every run — the disk here is the local one — and forced to fail below to
// prove the 503 path without needing a dead S3 endpoint.
describe('health', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  it('answers 200 with per-resource flags when db and storage are up', async () => {
    await http.get('/health').assertJson({ ok: true, db: true, storage: true })
  })

  it('answers 503 and names storage when the disk is unreachable', async () => {
    const disk = ambientContainer()!.make<StorageManager>('storage').disk()
    const put = disk.put
    // Only the write needs to fail: the check round-trips put → get → delete,
    // so a throwing put reports storage down while the database stays healthy.
    disk.put = async () => {
      throw new Error('bucket unreachable')
    }
    try {
      await http.get('/health').assertStatus(503).assertJson({ ok: false, db: true, storage: false })
    } finally {
      disk.put = put
    }
  })
})
