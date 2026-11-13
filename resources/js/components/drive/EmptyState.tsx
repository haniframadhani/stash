import type { LucideIcon } from 'lucide-react'

/** The required empty state of a drive list (UI_SPEC §9): icon, one line, hint. */
export default function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon, title: string, hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-g-card border border-dashed border-g-line-strong bg-g-panel px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-g-muted" aria-hidden />
      <h2 className="mt-4 text-lg font-bold text-g-heading">{title}</h2>
      {hint && <p className="mt-2 max-w-sm text-sm text-g-text-2">{hint}</p>}
    </div>
  )
}
