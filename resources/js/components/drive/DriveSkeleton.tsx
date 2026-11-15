import type { ViewMode } from '../../lib/driveView.js'

/** Loading skeletons for the drive list (UI_SPEC §9): the same grid/list shape
 *  the real content uses, so nothing shifts when the data lands. */
export default function DriveSkeleton({ view }: { view: ViewMode }) {
  if (view === 'list') {
    return (
      <div className="rounded-g-card border border-g-line bg-g-panel" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-g-line px-3 py-2 last:border-b-0">
            <div className="h-10 w-10 shrink-0 animate-pulse motion-reduce:animate-none rounded-g-ctl bg-g-raised" />
            <div className="h-4 w-1/3 animate-pulse motion-reduce:animate-none rounded-g-ctl bg-g-raised" />
            <div className="h-4 w-16 animate-pulse motion-reduce:animate-none rounded-g-ctl bg-g-raised" />
            <div className="ml-auto h-4 w-20 animate-pulse motion-reduce:animate-none rounded-g-ctl bg-g-raised" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-hidden>
      {Array.from({ length: 12 }, (_, index) => (
        <li key={index} className="overflow-hidden rounded-g-card border border-g-line bg-g-panel">
          <div className="aspect-[4/3] animate-pulse motion-reduce:animate-none bg-g-raised" />
          <div className="px-3 py-2">
            <div className="h-4 w-2/3 animate-pulse motion-reduce:animate-none rounded-g-ctl bg-g-raised" />
          </div>
        </li>
      ))}
    </ul>
  )
}
