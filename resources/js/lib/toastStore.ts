/** A tiny toast store (UI_SPEC §4): the drive page posts messages here, the
 *  `<Toasts/>` component subscribes. No external library — a module-level array
 *  and a callback list, because every toast is transient and dismissible.
 */

export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** Optional action (Retry, Undo) — the move's error path has none. */
  action?: { label: string, onClick: () => void }
}

type Listener = () => void

let sequence = 0
let toasts: Toast[] = []
const listeners: Listener[] = []

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index !== -1) listeners.splice(index, 1)
  }
}

export function getToasts(): readonly Toast[] {
  return toasts
}

export function showToast(kind: ToastKind, message: string, action?: Toast['action']): void {
  const toast: Toast = { id: ++sequence, kind, message, action }
  toasts = [...toasts, toast]
  emit()
}

export function dismissToast(id: number): void {
  const before = toasts.length
  toasts = toasts.filter((toast) => toast.id !== id)
  if (toasts.length !== before) emit()
}

export function clearToasts(): void {
  if (toasts.length === 0) return
  toasts = []
  emit()
}