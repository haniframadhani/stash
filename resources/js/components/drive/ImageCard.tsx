import { MoreVertical, Star } from 'lucide-react'
import type { ImageItem } from '../../types.js'

export interface ImageCardProps {
  image: ImageItem
  /** Toggles the hover checkbox and the accent ring; the floating selection
   *  bar and the keyboard selection rules arrive in task 2.3. */
  selected?: boolean
  onToggleSelect?: () => void
}

/** One grid card (UI_SPEC §4): 4/3 thumbnail with explicit dimensions, format
 *  badge, star, hover checkbox top-left and the ⋮ slot top-right. The context
 *  menu behind ⋮ is task 2.5, the lightbox behind a double-click task 2.5. */
export default function ImageCard({ image, selected = false, onToggleSelect }: ImageCardProps) {
  return (
    <li
      className={`group relative overflow-hidden rounded-g-card border bg-g-panel transition ${
        selected ? 'border-g-accent ring-2 ring-g-accent' : 'border-g-line'
      }`}
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
        <label
          className={`absolute left-2 top-2 rounded-g-ctl bg-g-panel/90 p-1 shadow-g-card transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          }`}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-g-accent"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${image.name}`}
          />
        </label>
        <button
          type="button"
          disabled
          title="Image actions arrive with the context menu (TASKS 2.5)"
          aria-label={`More actions for ${image.name}`}
          className="absolute right-2 top-2 rounded-full bg-g-panel/90 p-1.5 text-g-text-2 shadow-g-card opacity-0 transition-opacity group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        {image.starred && <Star className="h-4 w-4 shrink-0 fill-current text-g-accent-text" aria-label="Starred" />}
        <span className="truncate text-sm text-g-heading" title={image.name}>
          {image.name}
        </span>
      </div>
    </li>
  )
}
