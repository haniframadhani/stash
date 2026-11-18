import { X, MoveRight, Trash2 } from 'lucide-react'

/** The floating action bar (TASKS 2.3, UI_SPEC §1/§10). It carries the count,
 *  the clear action, Move (2.4) and Trash (4.2); Copy link and Star join it
 *  with 3.3/R1.2 and 4.1 — hidden until they work, never dead. */
export default function SelectionBar({
  count,
  onClear,
  onMove,
  onTrash,
}: {
  count: number
  onClear: () => void
  onMove: () => void
  onTrash?: () => void
}) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3 sm:bottom-6"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-g-line bg-g-panel py-1.5 pl-1.5 pr-4 shadow-g-float">
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="rounded-full p-2 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {/* Selecting announces the new count without stealing focus. */}
        <p role="status" aria-live="polite" className="text-sm font-bold text-g-heading">
          {count} selected
        </p>
        <button
          type="button"
          onClick={onMove}
          aria-label="Move selected items"
          className="flex items-center gap-1.5 rounded-full bg-g-accent px-2.5 py-1 text-xs font-bold text-g-on-accent transition hover:opacity-95"
        >
          <MoveRight className="h-4 w-4" aria-hidden />
          Move
        </button>
        {onTrash && (
          <button
            type="button"
            onClick={onTrash}
            aria-label="Move selected items to trash"
            className="flex items-center gap-1.5 rounded-full border border-g-line px-2.5 py-1 text-xs font-bold text-g-danger transition hover:bg-g-danger-tint"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Trash
          </button>
        )}
      </div>
    </div>
  )
}