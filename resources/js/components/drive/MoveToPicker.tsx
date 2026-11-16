import { useEffect, useMemo, useRef, useState } from 'react'
import { folderOptions } from '../../lib/folderTree.js'
import type { FolderItem } from '../../types.js'

/** The "Move to…" picker (UI_SPEC §4/§7): a select-like list of every active
 *  folder, indented so a user sees where each lives. The current folder and
 *  any folder the moved items live in are disabled, since a move there is a
 *  no-op or a cycle. The root is always the first option. */
export interface MoveToPickerProps {
  folders: readonly FolderItem[]
  /** The folder being browsed — it may not be a destination. */
  currentFolderId: number | null
  /** Every folder the moved items live in; moving into one of those is a cycle. */
  excluded: ReadonlySet<number>
  title: string
  busy: boolean
  onCancel: () => void
  onConfirm: (targetFolderId: number | null) => void
}

export default function MoveToPicker({
  folders,
  currentFolderId,
  excluded,
  title,
  busy,
  onCancel,
  onConfirm,
}: MoveToPickerProps) {
  const options = useMemo(
    () => folderOptions(folders, new Set([...excluded, ...(currentFolderId === null ? [] : [currentFolderId])])),
    [folders, excluded, currentFolderId],
  )
  const [value, setValue] = useState<number | null>(null)
  const inputRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    if (value === null) return
    onConfirm(value)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-center justify-center bg-g-ink/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-sm rounded-g-card border border-g-line bg-g-panel p-4 shadow-g-float">
        <h2 className="text-lg font-bold text-g-heading">{title}</h2>
        <p className="mt-1 text-sm text-g-text-2">Choose a destination folder, or My Files.</p>
        <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-g-muted">
          Destination
        </label>
        <select
          ref={inputRef}
          value={value === null ? '' : String(value)}
          onChange={(event) => setValue(event.target.value === '' ? null : Number(event.target.value))}
          disabled={busy}
          className="mt-1 w-full rounded-g-ctl border border-g-line bg-g-page px-3 py-2 text-sm text-g-heading focus:outline-none focus:ring-2 focus:ring-g-accent disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.id === null ? 'root' : String(option.id)} value={option.id === null ? '' : String(option.id)} disabled={option.disabled}>
              {'\u00A0'.repeat(option.depth * 2)}{option.name}
            </option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-g-ctl border border-g-line px-3 py-2 text-sm text-g-text transition hover:bg-g-raised disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || value === null}
            className="rounded-g-ctl bg-g-accent px-3 py-2 text-sm font-bold text-g-on-accent transition hover:opacity-95 disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  )
}