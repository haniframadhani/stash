/** Minimal toast stack (UI_SPEC §Toasts): bottom-right, one row per upload
 *  result, self-dismissing. Replaced wholesale by the task 1.6 queue UI. */
import { useEffect } from 'react'
import { CheckCircle2, TriangleAlert } from 'lucide-react'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  text: string
}

const DISMISS_AFTER_MS = 5000

function ToastRow({ toast, onDismiss }: { toast: Toast, onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <li
      role="status"
      className={`flex items-center gap-2 rounded-g-ctl border px-3 py-2 text-sm shadow-g-float ${
        toast.kind === 'success'
          ? 'border-g-line bg-g-panel text-g-heading'
          : 'border-g-danger/40 bg-g-panel text-g-heading'
      }`}
    >
      {toast.kind === 'success'
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-g-accent" aria-hidden />
        : <TriangleAlert className="h-4 w-4 shrink-0 text-g-danger" aria-hidden />}
      {toast.text}
    </li>
  )
}

export default function Toasts({ toasts, onDismiss }: { toasts: Toast[], onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <ul aria-live="polite" className="fixed bottom-4 right-4 z-40 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </ul>
  )
}
