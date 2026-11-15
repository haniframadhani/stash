import { Router, ambientContainer, type HealthManager, type CheckResult } from '@guren/core'
import { registerDriveRoutes } from './drive.js'
import { registerAuthRoutes } from './auth.js'
import { registerPublicRoutes } from './public.js'

export function registerWebRoutes(router: Router): void {
  registerPublicRoutes(router)
  registerAuthRoutes(router)
  registerDriveRoutes(router)

  // Health check for load balancers and uptime monitors: a real SELECT 1 on the
  // SQLite connection plus a write/read/delete round-trip on the configured
  // storage disk (registered, critical, in app/Providers/HealthProvider.ts).
  // Shape per docs/ROUTES_SPEC.md §1: 200 { ok, db, storage } — 503 { ok: false, … }
  // when either resource is down.
  router.get('/health', async (c) => {
    const health = ambientContainer()?.make<HealthManager>('health')
    if (!health) {
      // No booted application to probe: report the truth, not a guess.
      return c.json({ ok: false, db: false, storage: false }, 503)
    }

    const report = await health.check()
    const healthy = (name: string): boolean =>
      !report.checks.some((check: CheckResult) => check.name === name && check.status === 'unhealthy')
    const db = healthy('database')
    const storage = healthy('storage')

    return c.json(
      { ok: report.status !== 'unhealthy', db, storage },
      report.status === 'unhealthy' ? 503 : 200,
    )
  })
}
