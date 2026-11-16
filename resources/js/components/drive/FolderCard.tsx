import { Folder as FolderIcon } from 'lucide-react'
import { Link } from '@inertiajs/react'
import type { FolderItem } from '../../types.js'
import CardMenu from './CardMenu.js'
import RenameInput, { type RenameTarget } from './RenameInput.js'

export interface FolderCardProps {
  folder: FolderItem
  /** Inline rename (task 2.2): F2 on the hovered card or the ⋮ menu. */
  renaming?: boolean
  /** The attempted name and the server's message after a flashed clash error. */
  renameValue?: string
  renameError?: string | null
  onStartRename?: () => void
  onRenameDone?: () => void
  onRenameCancel?: () => void
  onHoverChange?: (hovered: boolean) => void
}

/** One folder pill above the images (UI_SPEC §4). Clicking or pressing Enter
 *  follows the Inertia link into `/files/:id`; folder selection rules land with
 *  task 2.3, so opening takes a single click for now. Drag-over highlight and
 *  the Move entry in the ⋮ menu come with task 2.4; Trash with 4.2. */
export default function FolderCard({
  folder,
  renaming = false,
  renameValue,
  renameError,
  onStartRename,
  onRenameDone,
  onRenameCancel,
  onHoverChange,
}: FolderCardProps) {
  return (
    <li
      className="group relative flex items-center rounded-g-card border border-g-line bg-g-panel transition hover:border-g-line-strong hover:bg-g-raised"
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      {renaming ? (
        /* The rename input replaces the link, so typing cannot navigate. */
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
          <FolderIcon className="h-5 w-5 shrink-0 text-g-accent" aria-hidden />
          <RenameInput
            target={{ kind: 'folder', id: folder.id } satisfies RenameTarget}
            initialName={renameValue ?? folder.name}
            error={renameError ?? null}
            onDone={onRenameDone ?? (() => {})}
            onCancel={onRenameCancel ?? (() => {})}
          />
        </div>
      ) : (
        <Link
          href={`/files/${folder.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3"
          title={folder.name}
        >
          <FolderIcon className="h-5 w-5 shrink-0 text-g-accent" aria-hidden />
          <span className="truncate text-sm text-g-heading">{folder.name}</span>
        </Link>
      )}
      <div className="mr-2">
        <CardMenu
          label={`More actions for folder ${folder.name}`}
          items={[{ label: 'Rename', onSelect: () => onStartRename?.() }]}
        />
      </div>
    </li>
  )
}
