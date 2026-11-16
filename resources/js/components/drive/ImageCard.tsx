import { Star } from 'lucide-react'
import type { ImageItem } from '../../types.js'
import CardMenu from './CardMenu.js'
import RenameInput, { type RenameTarget } from './RenameInput.js'

/** The modifier keys a card click carries into the selection rules. */
export interface SelectModifiers {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export interface ImageCardProps {
  image: ImageItem
  /** Whether the card is part of the current selection (UI_SPEC §4/§7). */
  selected?: boolean
  /** A click on the card body: plain selects, Ctrl/Cmd toggles, Shift extends. */
  onSelect?: (modifiers: SelectModifiers) => void
  /** The hover checkbox: an additive toggle that also sets the range anchor. */
  onToggleSelect?: () => void
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

/** One grid card (UI_SPEC §4): 4/3 thumbnail with explicit dimensions, format
 *  badge, star, hover checkbox top-left and the ⋮ menu top-right. The menu
 *  carries the actions that exist (Rename since 2.2); the rest of the context
 *  menu and the lightbox behind a double-click are task 2.5. */
export default function ImageCard({
  image,
  selected = false,
  onSelect,
  onToggleSelect,
  renaming = false,
  renameValue,
  renameError,
  onStartRename,
  onRenameDone,
  onRenameCancel,
  onHoverChange,
}: ImageCardProps) {
  return (
    <li
      className={`group relative cursor-pointer select-none overflow-hidden rounded-g-card border bg-g-panel transition ${
        selected ? 'border-g-accent ring-2 ring-g-accent' : 'border-g-line'
      }`}
      onClick={(event) =>
        onSelect?.({ shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
      }
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      <div className="relative aspect-[4/3] bg-g-raised">
        <img
          src={image.urls.thumb}
          alt={image.name}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <span className="absolute bottom-2 left-2 rounded-g-ctl bg-g-ink/75 px-1.5 py-0.5 text-[10px] font-bold uppercase text-g-on-ink">
          {image.format}
        </span>
        {/* The checkbox and the ⋮ menu act on their own: a click there must not
            also count as a card click, which would replace the selection. */}
        <label
          className={`absolute left-2 top-2 rounded-g-ctl bg-g-panel/90 p-1 shadow-g-card transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-g-accent"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${image.name}`}
          />
        </label>
        <div
          className={`absolute right-2 top-2 rounded-full bg-g-panel/90 shadow-g-card transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <CardMenu
            label={`More actions for ${image.name}`}
            items={[{ label: 'Rename', onSelect: () => onStartRename?.() }]}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        {image.starred && <Star className="h-4 w-4 shrink-0 fill-current text-g-accent-text" aria-label="Starred" />}
        {renaming ? (
          <RenameInput
            target={{ kind: 'image', id: image.id } satisfies RenameTarget}
            initialName={renameValue ?? image.name}
            error={renameError ?? null}
            onDone={onRenameDone ?? (() => {})}
            onCancel={onRenameCancel ?? (() => {})}
          />
        ) : (
          <span className="truncate text-sm text-g-heading" title={image.name}>
            {image.name}
          </span>
        )}
      </div>
    </li>
  )
}
