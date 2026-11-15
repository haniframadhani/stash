/** One row of the Review & convert dialog (UI_SPEC §3): preview thumb, name,
 *  size and dimensions, its own format and quality override, remove. Invalid
 *  rows show their inline problem and no controls. */
import { RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatBytes } from '../../lib/format.js'
import type { ReviewRow } from '../../lib/reviewFiles.js'
import { Select } from '../ui/Select.js'

export type RowFormat = 'webp' | 'avif' | 'original'

export interface ReviewRowItemProps {
  row: ReviewRow
  caps: { avif: boolean }
  format: RowFormat
  quality: number
  onFormat: (format: RowFormat) => void
  onQuality: (quality: number) => void
  onRemove: () => void
}

const AVIF_DISABLED_HINT = 'Animated images keep their animation in WebP; AVIF would flatten it.'

export default function ReviewRowItem({ row, caps, format, quality, onFormat, onQuality, onRemove }: ReviewRowItemProps) {
  // Preview and dimensions are client-only (UI_SPEC §3): an object URL loaded
  // into an image element, never a server call.
  const [preview, setPreview] = useState<{ url: string, width?: number, height?: number }>()

  useEffect(() => {
    if (!row.valid) return
    const url = URL.createObjectURL(row.file)
    const image = new Image()
    image.onload = () => setPreview({ url, width: image.naturalWidth, height: image.naturalHeight })
    setPreview({ url })
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [row.valid, row.file])

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2">
      {preview ? (
        <img
          src={preview.url}
          alt=""
          width={preview.width}
          height={preview.height}
          className="h-10 w-10 shrink-0 rounded-g-ctl border border-g-line bg-g-raised object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-g-ctl border border-g-line bg-g-raised text-g-danger">
          <TriangleAlert className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm text-g-heading" title={row.name}>{row.name}</p>
        <p className="flex items-center gap-1 text-xs text-g-muted">
          {formatBytes(row.size)}
          {preview?.width !== undefined && <> · {preview.width}×{preview.height}</>}
          {row.animated && (
            <>
              {' '}
              <RefreshCw className="h-3 w-3" aria-hidden />
              <span>animated</span>
            </>
          )}
        </p>
        {row.problem && <p className="text-xs text-g-danger" role="note">{row.problem}</p>}
      </div>
      {row.valid && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select
            aria-label={`Format for ${row.name}`}
            title={row.animated ? AVIF_DISABLED_HINT : undefined}
            value={format}
            onChange={(event) => onFormat(event.target.value as RowFormat)}
            className="w-28"
          >
            <option value="webp">WebP</option>
            <option value="avif" disabled={!caps.avif || row.animated}>{caps.avif ? 'AVIF' : 'AVIF (unavailable)'}</option>
            <option value="original">Original</option>
          </Select>
          {format !== 'original' && (
            <label className="flex shrink-0 items-center gap-1 text-xs text-g-muted">
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) => onQuality(Number(event.target.value))}
                aria-label={`Quality for ${row.name}`}
                className="w-20 accent-g-accent"
              />
              {quality}
            </label>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.name}`}
        className="rounded-g-ctl p-1.5 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </li>
  )
}
