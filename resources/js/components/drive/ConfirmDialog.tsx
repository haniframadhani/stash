/** A small confirm dialog (task 4.2: "Delete forever" and "Empty trash").
 *  Destructive on purpose, so the confirm button carries the danger token and
 *  focus lands on Cancel: Enter on a stray tab press does nothing irreversible. */
import { useEffect, useRef } from 'react'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener.current?.focus()
    }
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-g-ink/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-sm rounded-g-card border border-g-line bg-g-panel p-4 shadow-g-float">
        <h2 className="text-lg font-bold text-g-heading">{title}</h2>
        <p className="mt-1 text-sm text-g-text-2">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-g-ctl border border-g-line px-3 py-2 text-sm text-g-text transition hover:bg-g-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-g-ctl bg-g-danger px-3 py-2 text-sm font-bold text-g-on-ink transition hover:opacity-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
