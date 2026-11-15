import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ImageItem } from '../../types.js'
import { formatBytes, formatRelative } from '../../lib/format.js'
import type { DriveView, SortKey } from '../../lib/driveView.js'

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  size: 'Size',
  modified: 'Modified',
}

function HeaderSort({
  sortKey,
  label,
  view,
  onChange,
}: {
  sortKey: SortKey
  label: string
  view: DriveView
  onChange: (patch: Partial<DriveView>) => void
}) {
  const active = view.sort === sortKey
  const nextOrder = active && view.order === 'asc' ? 'desc' : 'asc'
  return (
    <button
      type="button"
      onClick={() => onChange({ sort: sortKey, order: nextOrder })}
      aria-label={`Sort by ${label.toLowerCase()}${active ? `, currently ${view.order === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      className={`inline-flex items-center gap-1 rounded-g-ctl px-1 py-0.5 transition hover:text-g-heading ${
        active ? 'text-g-heading' : ''
      }`}
    >
      {label}
      {active && (view.order === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)}
    </button>
  )
}

/** The list view (UI_SPEC §4): Name · Format · Dimensions · Size · Modified,
 *  a 40px thumbnail, and the sortable headers driving the same sort state as
 *  the toolbar. */
export default function ImageListView({
  images,
  view,
  onChange,
}: {
  images: ImageItem[]
  view: DriveView
  onChange: (patch: Partial<DriveView>) => void
}) {
  const ariaSort = (sortKey: SortKey): 'ascending' | 'descending' | undefined => {
    if (view.sort !== sortKey) return undefined
    return view.order === 'asc' ? 'ascending' : 'descending'
  }
  return (
    <div className="overflow-x-auto rounded-g-card border border-g-line bg-g-panel">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-g-line text-xs font-bold uppercase tracking-wide text-g-muted">
            <th scope="col" className="w-16 px-3 py-2" aria-label="Thumbnail" />
            <th scope="col" aria-sort={ariaSort('name')} className="px-3 py-2">
              <HeaderSort sortKey="name" label={SORT_LABELS.name} view={view} onChange={onChange} />
            </th>
            <th scope="col" className="px-3 py-2">Format</th>
            <th scope="col" className="px-3 py-2">Dimensions</th>
            <th scope="col" aria-sort={ariaSort('size')} className="px-3 py-2">
              <HeaderSort sortKey="size" label={SORT_LABELS.size} view={view} onChange={onChange} />
            </th>
            <th scope="col" aria-sort={ariaSort('modified')} className="px-3 py-2">
              <HeaderSort sortKey="modified" label={SORT_LABELS.modified} view={view} onChange={onChange} />
            </th>
          </tr>
        </thead>
        <tbody>
          {images.map((image) => (
            <tr key={image.id} className="border-b border-g-line last:border-b-0 hover:bg-g-raised">
              <td className="px-3 py-1.5">
                <img
                  src={image.urls.thumb}
                  alt={image.name}
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 rounded-g-ctl bg-g-raised object-cover"
                />
              </td>
              <td className="max-w-[16rem] truncate px-3 py-2 text-g-heading" title={image.name}>
                {image.name}
              </td>
              <td className="px-3 py-2 text-xs font-bold uppercase text-g-muted">{image.format}</td>
              <td className="px-3 py-2 font-mono text-xs text-g-text-2">
                {image.width}×{image.height}
              </td>
              <td className="px-3 py-2 text-g-text-2">{formatBytes(image.size)}</td>
              {/* The relative time differs between the SSR pass and hydration by
                  a few seconds at most; the client's value is the right one. */}
              <td className="px-3 py-2 text-g-text-2" suppressHydrationWarning>
                {formatRelative(image.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
