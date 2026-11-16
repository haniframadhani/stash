import { MoreVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** The ⋮ menu on a card (UI_SPEC §4/§7). Task 2.2 ships it with the actions
 *  that exist; the rest of the context menu (Open, Share, Move to…, Trash)
 *  arrives with 2.4/2.5/4.2 and stays hidden, not dead. */
export default function CardMenu({
  label,
  items,
}: {
  label: string
  items: Array<{ label: string, onSelect: () => void }>
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Click outside closes; Esc closes too (UI_SPEC §8).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="rounded-full p-1.5 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-1 w-36 rounded-g-card border border-g-line bg-g-panel p-1 shadow-g-float"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-center gap-2 rounded-g-ctl px-3 py-2 text-sm text-g-text transition hover:bg-g-raised hover:text-g-heading"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
