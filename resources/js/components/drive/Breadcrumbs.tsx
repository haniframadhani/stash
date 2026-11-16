import { ChevronRight } from 'lucide-react'
import { Link } from '@inertiajs/react'
import { Fragment } from 'react'
import type { Crumb } from '../../types.js'
import { isItemDrag } from '../../lib/itemDrag.js'

/** Breadcrumbs (UI_SPEC §4): every crumb is a link to its folder page; the
 *  current one (the tail) is plain text. Beyond 4 segments the middle ones
 *  collapse into a non-link `…`, keeping "My Files" and the last two visible.
 *  Task 2.4 makes every crumb a drop target: dropping a selection moves it into
 *  that folder, so the breadcrumb row is a shortcut for "move here". */
export default function Breadcrumbs({ crumbs, onDrop }: { crumbs: readonly Crumb[]; onDrop?: (folderId: number | null) => void }) {
  if (crumbs.length === 0) return null

  type Segment = { crumb: Crumb, elision?: false } | { elision: true }
  const segments: Segment[] =
    crumbs.length <= 4
      ? crumbs.map((crumb) => ({ crumb }))
      : [{ crumb: crumbs[0]! }, { elision: true }, { crumb: crumbs[crumbs.length - 2]! }, { crumb: crumbs[crumbs.length - 1]! }]

  return (
    <nav
      aria-label="Folder path"
      className="flex min-w-0 items-center gap-1 text-xl font-bold text-g-heading"
      onDragOver={(event) => {
        if (!onDrop || !isItemDrag(event.dataTransfer)) return
        event.preventDefault()
      }}
      onDrop={(event) => {
        if (!onDrop || !isItemDrag(event.dataTransfer)) return
        event.preventDefault()
        onDrop(null)
      }}
    >
      {segments.map((segment, index) => {
        const current = index === segments.length - 1
        return (
          <Fragment key={segment.elision ? `elision-${index}` : `crumb-${segment.crumb.id}`}>
            {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-g-muted" aria-hidden />}
            {'elision' in segment ? (
              <span aria-hidden className="px-1 font-normal text-g-muted">
                …
              </span>
            ) : current ? (
              <span className="truncate" aria-current="page">
                {segment.crumb.name}
              </span>
            ) : (
              <Link
                href={segment.crumb.id === null ? '/files' : `/files/${segment.crumb.id}`}
                className="truncate font-normal text-g-text-2 transition hover:text-g-heading hover:underline"
                onDragOver={(event) => {
                  if (!onDrop || !isItemDrag(event.dataTransfer)) return
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  if (!onDrop || !isItemDrag(event.dataTransfer)) return
                  event.preventDefault()
                  onDrop(segment.crumb.id)
                }}
              >
                {segment.crumb.name}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}