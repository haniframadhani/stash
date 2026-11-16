import { useSyncExternalStore } from 'react'
import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { dismissToast, getToasts, showToast, subscribe, type Toast } from '../lib/toastStore.js'
import type { StashFlash } from '../types.js'

/** Toasts (UI_SPEC §4). The server's flashed `flash` prop becomes one on every
 *  page response; the client pushes its own (optimistic-rollback errors) into
 *  the same store. Each dismisses itself after 4s. */
export default function Toasts() {
  const { props } = usePage()
  const flash = (props as { flash?: StashFlash }).flash
  const seen = useRef('')

  useEffect(() => {
    const signature = `${flash?.success ?? ''}|${flash?.error ?? ''}`
    if (signature === seen.current) return
    seen.current = signature
    if (flash?.success) showToast('success', flash.success)
    else if (flash?.error) showToast('error', flash.error)
  }, [flash])

  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 sm:bottom-6">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function Toast({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id])

  const icon =
    toast.kind === 'success'
      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-g-ok" aria-hidden />
      : <AlertTriangle className="h-4 w-4 shrink-0 text-g-danger" aria-hidden />

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex items-center gap-2 rounded-g-card border border-g-line bg-g-panel px-3 py-2 shadow-g-float"
    >
      {icon}
      <p className="min-w-0 flex-1 text-sm text-g-heading">{toast.message}</p>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-g-ctl p-1 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}