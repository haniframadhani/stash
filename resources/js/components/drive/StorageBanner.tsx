import { TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface HealthBody {
  ok: boolean
  db: boolean
  storage: boolean
}

/** A result younger than this is reused, so navigating between pages (which
 *  remounts the shell, this banner included) does not hammer `GET /health` —
 *  every check runs a real put/get/delete round-trip on the storage disk. */
const CHECK_TTL_MS = 30_000
let lastCheckAt = 0
let lastStorageOk = true

/** The storage error state (UI_SPEC §9): when `/health` reports the storage
 *  disk unreachable, a banner with a Retry explains why thumbnails fail. */
export default function StorageBanner() {
  const [down, setDown] = useState(!lastStorageOk)

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - lastCheckAt < CHECK_TTL_MS) {
      setDown(!lastStorageOk)
      return
    }
    lastCheckAt = Date.now()
    try {
      const response = await fetch('/health', { headers: { Accept: 'application/json' } })
      const body = (await response.json()) as HealthBody
      lastStorageOk = body.storage
    } catch {
      lastStorageOk = false
    }
    setDown(!lastStorageOk)
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  if (!down) return null
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-g-warn-chip bg-g-warn-tint px-4 py-2 text-sm sm:px-6"
    >
      <TriangleAlert className="h-4 w-4 shrink-0 text-g-warn" aria-hidden />
      <p className="text-g-heading">Storage is unreachable. Is your S3 service running?</p>
      <button
        type="button"
        onClick={() => void check(true)}
        className="ml-auto shrink-0 rounded-g-ctl border border-g-warn-chip px-3 py-1 text-sm font-bold text-g-warn transition hover:bg-g-warn-tint"
      >
        Retry
      </button>
    </div>
  )
}
