import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'

export interface RenameTarget {
  kind: 'image' | 'folder'
  id: number
}

interface RenameAttempt {
  target: RenameTarget
  name: string
}

/** The last rename sent. The framework answers an invalid Inertia request with
 *  a redirect back carrying `errors` in the page props (Validation guide:
 *  "Automatic Handling on Inertia Requests"), and that visit unmounts the
 *  input — so the attempt is remembered here, and the page reopens the input
 *  on the same item with the flashed message. */
let pendingAttempt: RenameAttempt | null = null

export function takeFailedRename(
  errors: Record<string, string> | undefined,
): { attempt: RenameAttempt, message: string } | null {
  if (!pendingAttempt || typeof errors?.name !== 'string') return null
  const failed = { attempt: pendingAttempt, message: errors.name }
  pendingAttempt = null
  return failed
}

export function clearRenameAttempt(): void {
  pendingAttempt = null
}

/** Inline rename (task 2.2): the input replaces the name, Enter or blur
 *  commits, Esc cancels. Commits through `folders.update` / `images.update`;
 *  the flash-driven `errors` prop re-renders it with the sibling-clash message
 *  (and the attempted name) after the redirect, so the error is inline. */
export default function RenameInput({
  target,
  initialName,
  error = null,
  onDone,
  onCancel,
}: {
  target: RenameTarget
  initialName: string
  /** A server-side message for a previous attempt (`errors.name`). */
  error?: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter commits, then the following blur (or a remount lag) must not PATCH
  // again; Esc must beat a stray blur that fires around the unmount.
  const settledRef = useRef<'committed' | 'canceled' | null>(null)
  const shownError = error ?? localError

  // Focus and select on open; restore focus to the page on close (UI_SPEC §10).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => opener?.focus()
  }, [])

  const commit = () => {
    if (busy || settledRef.current !== null) return
    const next = name.trim()
    if (next.length === 0) {
      setLocalError('The name cannot be empty.')
      return
    }
    if (next === initialName) {
      settledRef.current = 'canceled'
      clearRenameAttempt()
      onCancel()
      return
    }
    settledRef.current = 'committed'
    pendingAttempt = { target, name: next }
    setBusy(true)
    router.patch(target.kind === 'image' ? `/images/${target.id}` : `/folders/${target.id}`, { name: next }, {
      preserveScroll: true,
      onSuccess: () => {
        onDone()
      },
      onFinish: () => setBusy(false),
    })
  }

  return (
    <div className="min-w-0" onClick={(event) => event.stopPropagation()}>
      <input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            settledRef.current = 'canceled'
            clearRenameAttempt()
            onCancel()
          }
        }}
        onBlur={commit}
        disabled={busy}
        maxLength={255}
        aria-label={`Rename ${initialName}`}
        aria-invalid={shownError !== null}
        aria-describedby={shownError !== null ? `rename-error-${target.kind}-${target.id}` : undefined}
        autoComplete="off"
        className={`w-full rounded-g-ctl border bg-g-page px-1.5 py-0.5 text-sm text-g-heading outline-none transition focus:border-g-accent ${
          shownError !== null ? 'border-g-danger' : 'border-g-accent'
        }`}
      />
      {shownError !== null && (
        <p id={`rename-error-${target.kind}-${target.id}`} className="mt-1 text-xs text-g-danger" role="alert">
          {shownError}
        </p>
      )}
    </div>
  )
}
