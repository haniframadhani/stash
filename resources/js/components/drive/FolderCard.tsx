import { Folder as FolderIcon, MoreVertical } from 'lucide-react'
import { Link } from '@inertiajs/react'
import type { FolderItem } from '../../types.js'

/** One folder pill above the images (UI_SPEC §4). Clicking or pressing Enter
 *  follows the Inertia link into `/files/:id`; folder selection rules land with
 *  task 2.3, so opening takes a single click for now. Drag-over highlight and
 *  the ⋮ menu come with Move (2.4) and Rename (2.2). */
export default function FolderCard({ folder }: { folder: FolderItem }) {
  return (
    <li className="group relative flex items-center rounded-g-card border border-g-line bg-g-panel transition hover:border-g-line-strong hover:bg-g-raised">
      <Link
        href={`/files/${folder.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3"
        title={folder.name}
      >
        <FolderIcon className="h-5 w-5 shrink-0 text-g-accent" aria-hidden />
        <span className="truncate text-sm text-g-heading">{folder.name}</span>
      </Link>
      <button
        type="button"
        disabled
        title="Folder actions arrive with rename (TASKS 2.2)"
        aria-label={`More actions for folder ${folder.name}`}
        className="mr-2 rounded-full p-1.5 text-g-text-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
    </li>
  )
}
