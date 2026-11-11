import { DatabaseCheck, StorageCheck, ServiceProvider, type HealthManager, type StorageManager } from '@guren/core'
import { getDatabase } from '../../config/database.js'

// `getDatabase()` returns the drizzle bun-sqlite wrapper, which proxies the raw
// `run(sql)` of the underlying bun:sqlite handle — the shape a health probe can
// call (this driver has no async `execute` to wrap like the Postgres guides show).
type RawSqlRunner = { run(sql: string): unknown }

export default class HealthProvider extends ServiceProvider {
  register(): void {
    const health = this.container.make<HealthManager>('health')

    // A real query on the app's SQLite connection — sessions and drive rows
    // both fail without it.
    health.register(
      new DatabaseCheck({
        query: async (sql) => ((await getDatabase()) as RawSqlRunner).run(sql),
      }),
      { critical: true },
    )

    // A write/read/delete round-trip on the configured disk (memory in tests,
    // the live S3 endpoint otherwise). Critical: image serving is the product,
    // so an unreachable bucket must fail /health with 503, not degrade it.
    health.register(
      new StorageCheck(this.container.make<StorageManager>('storage').disk()),
      { critical: true },
    )
  }

  boot(): void {}
}
