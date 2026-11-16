import { FolderPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'

/** The "New folder" dialog (UI_SPEC §4): name + destination (the folder being
 *  browsed), POSTing `folders.store`. Inertia follows the server's 303 redirect
 *  (back to the current folder), so the refreshed page lists the new folder. */
export interface NewFolderDialogProps {
  /** The folder the new one is created in; `null` = root ("My Files"). */
  parentId: number | null
  destinationName: string
  onCancel: () => void
}

export default function NewFolderDialog({ parentId, destinationName, onCancel }: NewFolderDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the name field on open and restore focus on close (UI_SPEC §10).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => opener?.focus()
  }, [])

  // Esc closes dialogs (UI_SPEC §8); a backdrop click does the same.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    // `folders.store` (ROUTES_SPEC §4). Nothing is sent at root when the
    // dialog is opened there, so the omitted parentId means "root".
    router.post(
      '/folders',
      parentId === null ? { name } : { name, parentId },
      {
        // The Layout shell persists across Inertia visits, so the dialog
        // closes itself on success rather than on a remount.
        onSuccess: () => onCancel(),
        onError: (errors) => {
          setBusy(false)
          setError(typeof errors.name === 'string' ? errors.name : (errors.name?.[0] ?? 'The folder could not be created.'))
        },
        onFinish: () => setBusy(false),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-g-ink/60" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-folder-title"
        className="relative w-full max-w-sm rounded-g-card border border-g-line bg-g-panel p-5 shadow-g-float"
      >
        <h2 id="new-folder-title" className="flex items-center gap-2 text-base font-bold text-g-heading">
          <FolderPlus className="h-5 w-5 text-g-accent" aria-hidden />
          New folder
        </h2>
        <p className="mt-1 text-xs text-g-muted">In “{destinationName}”</p>
        <form onSubmit={submit} className="mt-4">
          <label htmlFor="new-folder-name" className="text-xs font-bold uppercase tracking-wide text-g-muted">
            Name
          </label>
          <input
            ref={inputRef}
            id="new-folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={255}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? 'new-folder-error' : undefined}
            className="mt-1 w-full rounded-g-ctl border border-g-line-strong bg-g-page px-3 py-2 text-sm text-g-heading outline-none transition focus:border-g-accent"
          />
          {error !== null && (
            <p id="new-folder-error" className="mt-2 text-xs text-g-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-g-ctl border border-g-line px-3 py-1.5 text-sm text-g-text transition hover:border-g-muted hover:text-g-heading"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || name.trim().length === 0}
              className="rounded-g-ctl bg-g-accent px-3 py-1.5 text-sm font-bold text-g-on-accent transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
