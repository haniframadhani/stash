/** 1.05 KB, 4.2 MB, 1.2 GB — shown as uploaded, base-1024. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = units[0]!
  for (const next of units) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

/** "3 minutes ago", "2 days ago" for the list view's Modified column; older
 *  than a month falls back to a plain date. */
export function formatRelative(epochMs: number): string {
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const diffMs = epochMs - Date.now()
  const absMs = Math.abs(diffMs)
  if (absMs >= 30 * 86_400_000) {
    return new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }
  if (absMs >= 86_400_000) return relative.format(Math.round(diffMs / 86_400_000), 'day')
  if (absMs >= 3_600_000) return relative.format(Math.round(diffMs / 3_600_000), 'hour')
  return relative.format(Math.round(diffMs / 60_000), 'minute')
}
