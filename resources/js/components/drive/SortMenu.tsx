import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DriveView, SortKey, SortOrder } from '../../lib/driveView.js'

const SORT_OPTIONS: readonly { key: SortKey, label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Modified' },
  { key: 'size', label: 'Size' },
]
const ORDER_OPTIONS: readonly { key: SortOrder, label: string }[] = [
  { key: 'asc', label: 'Ascending' },
  { key: 'desc', label: 'Descending' },
]

const ITEM = 'flex w-full items-center justify-between gap-3 rounded-g-ctl px-3 py-2 text-sm text-g-text transition hover:bg-g-raised hover:text-g-heading'

function Option({
  label,
  checked,
  onPick,
}: {
  label: string
  checked: boolean
  onPick: () => void
}) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} onClick={onPick} className={ITEM}>
      {label}
      {checked && <Check className="h-4 w-4 text-g-accent-text" aria-hidden />}
    </button>
  )
}

/** The toolbar's "Sort" menu (UI_SPEC §1): key and order, driving the same
 *  state the list headers do. Closes on Escape or an outside press and returns
 *  focus to the button. */
export default function SortMenu({
  view,
  onChange,
}: {
  view: DriveView
  onChange: (patch: Partial<DriveView>) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const currentLabel = SORT_OPTIONS.find((option) => option.key === view.sort)?.label ?? 'Name'
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${currentLabel}, ${view.order === 'asc' ? 'ascending' : 'descending'}`}
        className="flex items-center gap-1.5 rounded-g-ctl border border-g-line bg-g-panel px-3 py-1.5 text-sm text-g-text transition hover:border-g-muted hover:text-g-heading"
      >
        <ArrowUpDown className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{currentLabel}</span>
        {view.order === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sort"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-g-card border border-g-line bg-g-panel p-1 shadow-g-float"
        >
          {SORT_OPTIONS.map((option) => (
            <Option
              key={option.key}
              label={option.label}
              checked={view.sort === option.key}
              onPick={() => {
                setOpen(false)
                buttonRef.current?.focus()
                onChange({ sort: option.key })
              }}
            />
          ))}
          <div className="my-1 border-t border-g-line" role="separator" />
          {ORDER_OPTIONS.map((option) => (
            <Option
              key={option.key}
              label={option.label}
              checked={view.order === option.key}
              onPick={() => {
                setOpen(false)
                buttonRef.current?.focus()
                onChange({ order: option.key })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
