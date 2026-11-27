/** The Review & convert dialog (UI_SPEC §3): drop, paste or picker → this
 *  dialog → Confirm. Nothing is uploaded until Confirm. Global controls set
 *  the defaults every row follows until it overrides; "Apply to all" resets
 *  those overrides. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { defaultQuality, loadUploadSettings, saveUploadSettings } from '../../lib/uploadSettings.js'
import type { ReviewRow } from '../../lib/reviewFiles.js'
import type { StashCapabilities } from '../../types.js'
import { Button } from '../ui/Button.js'
import { Checkbox } from '../ui/Checkbox.js'
import { Input } from '../ui/Input.js'
import ReviewRowItem, { type RowFormat } from './ReviewRow.js'
import type { ConvertOptions } from './upload.js'

export interface ReviewUpload {
  file: File
  name: string
  options: ConvertOptions
}

interface ReviewDialogProps {
  rows: ReviewRow[]
  caps: StashCapabilities
  /** The destination from the page's breadcrumbs, shown in title and overlay. */
  folderName?: string | null
  /** Task 3.1 replace reuses the same dialog for a single image: the heading
   *  names the image and the button says Replace. */
  heading?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (uploads: ReviewUpload[]) => void
}

/** One dialog row: its own format and quality, `overridden` stops it from
 *  following the global controls. */
interface DialogRow {
  row: ReviewRow
  format: RowFormat
  quality: number
  overridden: boolean
}

/** Animated rows can never take AVIF — it would flatten them (IMAGE_PIPELINE §2). */
function rowFormat(row: ReviewRow, format: RowFormat): RowFormat {
  return row.animated && format === 'avif' ? 'webp' : format
}

export default function ReviewDialog({ rows, caps, folderName, heading, confirmLabel, onCancel, onConfirm }: ReviewDialogProps) {
  const remembered = loadUploadSettings(caps)
  const [format, setFormat] = useState<RowFormat>(() => remembered?.format ?? caps.defaults.format)
  const [quality, setQuality] = useState(() => remembered?.quality ?? defaultQuality(caps, format))
  const [maxDimension, setMaxDimension] = useState(() => (remembered?.maxDimension !== undefined ? String(remembered.maxDimension) : ''))
  const [remember, setRemember] = useState(() => remembered !== null)
  // `remembered` re-reads storage on every render; the states above only use
  // it in their initializers. Kept out of render logic on purpose.
  const [dialogRows, setDialogRows] = useState<DialogRow[]>(() =>
    rows.map((row) => ({
      row,
      format: rowFormat(row, format),
      quality,
      overridden: false,
    })),
  )

  const dimension = Number.parseInt(maxDimension, 10)
  const maxDimensionValue = Number.isInteger(dimension) && dimension > 0 ? dimension : undefined

  const validRows = dialogRows.filter((entry) => entry.row.valid)
  const validCount = validRows.length
  const flaggedCount = dialogRows.length - validCount
  const storesOriginal = validRows.some((entry) => entry.format === 'original')

  function changeFormat(next: RowFormat) {
    setFormat(next)
    const nextQuality = defaultQuality(caps, next)
    setQuality(nextQuality)
    setDialogRows((current) =>
      current.map((entry) => (entry.overridden ? entry : { ...entry, format: rowFormat(entry.row, next), quality: nextQuality })),
    )
  }

  function changeQuality(next: number) {
    setQuality(next)
    setDialogRows((current) => current.map((entry) => (entry.overridden ? entry : { ...entry, quality: next })))
  }

  function applyToAll() {
    setDialogRows((current) =>
      current.map((entry) => ({ ...entry, format: rowFormat(entry.row, format), quality, overridden: false })),
    )
  }

  function confirm() {
    if (remember) {
      saveUploadSettings({ format, quality, maxDimension: maxDimensionValue })
    }
    onConfirm(
      validRows.map((entry) => ({
        file: entry.row.file,
        name: entry.row.name,
        options: {
          format: entry.format,
          quality: entry.format !== 'original' ? entry.quality : undefined,
          maxDimension: maxDimensionValue,
        },
      })),
    )
  }

  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  // Focus trap plus Esc (UI_SPEC §10); the first and last focusable edge-wrap.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable.at(-1)!
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const title = validCount > 0
    ? heading ?? `Upload ${validCount} ${validCount === 1 ? 'image' : 'images'}${folderName ? ` to "${folderName}"` : ''}`
    : 'Nothing to upload'

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-g-ink/60" onClick={onCancel} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex justify-center sm:inset-0">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-dialog-title"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="flex max-h-[92vh] w-full flex-col rounded-t-g-card border border-g-line bg-g-panel shadow-g-float outline-none sm:max-w-2xl sm:rounded-g-card"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 id="review-dialog-title" className="text-base font-bold text-g-heading">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close dialog"
              className="rounded-g-ctl p-1.5 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-g-line px-4 py-3">
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">Format for all images</legend>
              {(
                [
                  { value: 'webp', label: 'WebP', disabled: !caps.webp, hint: caps.webp ? undefined : 'WebP is unavailable on this server.' },
                  { value: 'avif', label: 'AVIF', disabled: !caps.avif, hint: caps.avif ? undefined : 'This server cannot encode AVIF.' },
                  { value: 'original', label: 'Original', disabled: false, hint: 'Keeps metadata (including GPS) and stores the file as uploaded.' },
                ] as const
              ).map((option) => (
                <label key={option.value} className="flex items-center gap-1.5 text-sm text-g-text" title={option.hint}>
                  <input
                    type="radio"
                    name="review-format"
                    value={option.value}
                    checked={format === option.value}
                    disabled={option.disabled}
                    onChange={() => changeFormat(option.value)}
                    className="accent-g-accent"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <Button variant="secondary" size="sm" onClick={applyToAll}>Apply to all</Button>
            <label className="flex items-center gap-2 text-sm text-g-text">
              Quality
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) => changeQuality(Number(event.target.value))}
                aria-label="Quality for all images"
                className="w-32 accent-g-accent"
              />
              <span className="font-mono text-xs">{quality}</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-g-text">
              Max size
              <Input
                type="number"
                min={1}
                value={maxDimension}
                onChange={(event) => setMaxDimension(event.target.value)}
                placeholder="—"
                aria-label="Maximum dimension in pixels, optional"
                className="w-24"
              />
              <span className="text-xs text-g-muted">px (optional)</span>
            </label>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-g-line overflow-y-auto border-t border-g-line">
            {dialogRows.map((entry) => (
              <ReviewRowItem
                key={entry.row.id}
                row={entry.row}
                caps={caps}
                format={entry.format}
                quality={entry.quality}
                onFormat={(next) => {
                  setDialogRows((current) =>
                    current.map((candidate) => (candidate.row.id === entry.row.id ? { ...candidate, format: next, overridden: true } : candidate)),
                  )
                }}
                onQuality={(next) => {
                  setDialogRows((current) =>
                    current.map((candidate) => (candidate.row.id === entry.row.id ? { ...candidate, quality: next, overridden: true } : candidate)),
                  )
                }}
                onRemove={() => setDialogRows((current) => current.filter((candidate) => candidate.row.id !== entry.row.id))}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-g-line px-4 py-3">
            <p className="flex items-start gap-2 text-xs text-g-muted">
              <span aria-hidden>ⓘ</span>
              Originals are not stored. Metadata such as GPS is removed.
            </p>
            {storesOriginal && (
              <p role="note" className="flex items-start gap-2 text-xs text-g-warn">
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
                Original keeps metadata (including GPS) and stores the file exactly as uploaded.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Checkbox
                label={<span className="text-sm text-g-text">Remember these settings</span>}
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button onClick={confirm} disabled={validCount === 0}>{confirmLabel ?? `Upload ${validCount}`}</Button>
              </div>
            </div>
            {flaggedCount > 0 && (
              <p className="text-xs text-g-muted">
                {flaggedCount} of {dialogRows.length} {flaggedCount === 1 ? 'file is' : 'files are'} excluded from this upload.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
