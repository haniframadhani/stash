import { LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '../../lib/driveView.js'

const BUTTON = 'rounded-g-ctl p-1.5 transition'
const ACTIVE = 'bg-g-raised text-g-heading shadow-g-card'
const INACTIVE = 'text-g-muted hover:text-g-heading'

/** The ⊞/☰ view toggle (UI_SPEC §1 toolbar). */
export default function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (view: ViewMode) => void
}) {
  return (
    <div role="group" aria-label="View" className="flex items-center gap-0.5 rounded-g-ctl border border-g-line bg-g-panel p-0.5">
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={view === 'grid'}
        aria-label="Grid view"
        className={`${BUTTON} ${view === 'grid' ? ACTIVE : INACTIVE}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={view === 'list'}
        aria-label="List view"
        className={`${BUTTON} ${view === 'list' ? ACTIVE : INACTIVE}`}
      >
        <List className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
