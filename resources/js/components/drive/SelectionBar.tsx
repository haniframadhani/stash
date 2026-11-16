import { X } from 'lucide-react'

/** The floating action bar (TASKS 2.3, UI_SPEC §1/§10). It carries the count
 *  and the clear action for now; Copy link, Move, Star and Trash join it with
 *  tasks 3.3, 2.4, 4.1 and 4.2 — hidden until they work, never dead. */
export default function SelectionBar({
  count,
  onClear,
}: {
  count: number
  onClear: () => void
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
      </div>
    </div>
  )
}
