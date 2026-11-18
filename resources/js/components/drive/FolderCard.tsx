import { Folder as FolderIcon } from 'lucide-react'
import { Link } from '@inertiajs/react'
import type { FolderItem } from '../../types.js'
import CardMenu from './CardMenu.js'
import RenameInput, { type RenameTarget } from './RenameInput.js'
import { clearDrag } from '../../lib/itemDrag.js'

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
  /** Drag and drop (task 2.4): dragging this card starts an in-drive move of the folder. */
  onDragStart?: (event: React.DragEvent) => void
  /** Drag and drop (task 2.4): dropping a selection here moves it into this folder. */
  onDropFolder?: (folderId: number) => void
  /** True while a selection is being dragged over this card. */
  dragOver?: boolean
  /** Task 4.2: the folder and its contents leave the drive for the Trash. */
  onTrash?: () => void
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
  onDragStart,
  onDropFolder,
  dragOver = false,
  onTrash,
}: FolderCardProps) {
  return (
    <li
      className={`group relative flex items-center rounded-g-card border bg-g-panel transition ${
        dragOver
          ? 'border-g-accent ring-2 ring-g-accent'
          : 'border-g-line transition hover:border-g-line-strong hover:bg-g-raised'
      }`}
      draggable={onDragStart !== undefined}
      onDragStart={(event) => {
        if (!onDragStart) return
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(event)
      }}
      onDragEnd={() => clearDrag()}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      onDragOver={(event) => {
        if (!onDropFolder) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragEnter={(event) => {
        if (!onDropFolder) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={(event) => {
        if (!onDropFolder) return
        event.stopPropagation()
      }}
      onDrop={(event) => {
        if (!onDropFolder) return
        event.preventDefault()
        event.stopPropagation()
        onDropFolder(folder.id)
      }}
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
          items={[
            { label: 'Rename', onSelect: () => onStartRename?.() },
            ...(onTrash ? [{ label: 'Move to trash', onSelect: onTrash }] : []),
          ]}
        />
      </div>
    </li>
  )
}