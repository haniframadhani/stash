/** The upload queue panel (UI_SPEC §4): bottom-right, collapsible, one row per
 *  file with progress, cancel or retry, and the savings once stored. */
import { ChevronDown, ChevronUp, CircleX, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { formatBytes } from '../../lib/format.js'
import { cancelUpload, clearFinishedUploads, retryUpload, type QueueItem } from './queueStore.js'

const STATUS_ORDER: Record<QueueItem['status'], number> = { uploading: 0, waiting: 1, error: 2, done: 3, canceled: 4 }

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-g-heading" title={item.name}>{item.name}</p>
        {item.status === 'waiting' && <p className="text-xs text-g-muted">Waiting…</p>}
        {item.status === 'uploading' && (
          <p className="flex items-center gap-2 text-xs text-g-muted">
            <span className="h-1.5 w-full overflow-hidden rounded-g-ctl bg-g-raised" aria-hidden>
              <span className="block h-full bg-g-accent" style={{ width: `${item.progress}%` }} />
            </span>
            {item.progress}%
          </p>
        )}
        {item.status === 'done' && item.storedSize !== undefined && item.savedPercent !== undefined && (
          <p className="text-xs text-g-ok">
            {formatBytes(item.size)} → {formatBytes(item.storedSize)} (−{item.savedPercent}%)
          </p>
        )}
        {item.status === 'error' && (
          <p className="truncate text-xs text-g-danger" title={item.message}>{item.message}</p>
        )}
        {item.status === 'canceled' && <p className="text-xs text-g-muted">Canceled</p>}
      </div>
      {item.status === 'uploading' && (
        <button
          type="button"
          onClick={() => cancelUpload(item.id)}
          aria-label={`Cancel ${item.name}`}
          className="rounded-g-ctl p-1 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {item.status === 'error' && (
        <button
          type="button"
          onClick={() => retryUpload(item.id)}
          aria-label={`Retry ${item.name}`}
          className="rounded-g-ctl p-1 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  )
}

export default function UploadQueue({ items }: { items: QueueItem[] }) {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  const active = items.filter((item) => item.status === 'waiting' || item.status === 'uploading')
  const done = items.filter((item) => item.status === 'done').length
  const failed = items.filter((item) => item.status === 'error').length
  const canceled = items.filter((item) => item.status === 'canceled').length
  const finished = items.length - active.length

  const heading = active.length > 0
    ? `Uploading ${finished} of ${items.length}`
    : failed > 0
      ? `${done} uploaded · ${failed} failed${canceled > 0 ? ` · ${canceled} canceled` : ''}`
      : `${items.length} ${items.length === 1 ? 'upload' : 'uploads'} complete`

  return (
    <section
      aria-label="Upload queue"
      className="fixed bottom-4 right-4 z-40 flex max-h-[60vh] w-80 flex-col rounded-g-card border border-g-line bg-g-panel shadow-g-float"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-g-heading transition hover:bg-g-raised"
      >
        {heading}
        {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <ul className="min-h-0 divide-y divide-g-line overflow-y-auto border-t border-g-line">
          {[...items].sort((left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.id - right.id).map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {open && active.length === 0 && (
        <div className="flex items-center justify-between border-t border-g-line px-3 py-2">
          <span className="flex items-center gap-1 text-xs text-g-muted">
            <CircleX className="h-3.5 w-3.5" aria-hidden />
            {canceled > 0 ? `${canceled} canceled` : 'All uploads settled'}
          </span>
          <button
            type="button"
            onClick={clearFinishedUploads}
            className="rounded-g-ctl px-2 py-1 text-sm text-g-accent-text transition hover:bg-g-accent-tint"
          >
            Clear
          </button>
        </div>
      )}
    </section>
  )
}
