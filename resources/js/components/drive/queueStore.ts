/** The upload queue (UI_SPEC §4): bottom-right panel, concurrency 2, progress,
 *  cancel, retry, per-file savings. The state lives in a module store, not in
 *  a component: every page renders its own <Layout>, so React would remount a
 *  component-level queue on every client-side navigation and drop an in-flight
 *  queue on the floor. `useUploadQueue` subscribes with
 *  `useSyncExternalStore`, so a remount simply re-attaches to the same queue. */
import { useSyncExternalStore } from 'react'
import { startUpload, type ConvertOptions, type UploadHandle, type UploadOutcome } from './upload.js'

export type QueueStatus = 'waiting' | 'uploading' | 'done' | 'error' | 'canceled'

export interface QueueItem {
  id: number
  name: string
  size: number
  /** Kept for retry. */
  file: File
  options: ConvertOptions
  status: QueueStatus
  /** Upload progress 0–100; server-side conversion keeps it at 100. */
  progress: number
  storedSize?: number
  savedPercent?: number
  message?: string
}

export interface QueueUpload {
  file: File
  name: string
  options: ConvertOptions
}

/** UI_SPEC §4: the queue sends two at a time. */
const CONCURRENCY = 2

let items: QueueItem[] = []
let nextId = 1
const running = new Set<number>()
/** Live request handles, so a cancel aborts the actual XHR; aborting is the
 *  only safe cancel — the promise's own resolve marks the row canceled. */
const active = new Map<number, UploadHandle>()
const listeners = new Set<() => void>()
/** Set by the mounted panel's owner; cleared on unmount. Navigation gaps just
 *  miss a grid refresh, the uploads themselves continue. */
let onUploaded: ((outcome: UploadOutcome) => void) | undefined

function commit(next: QueueItem[]): void {
  items = next
  for (const listener of listeners) listener()
}

function patch(id: number, changes: Partial<QueueItem>): void {
  commit(items.map((item) => (item.id === id ? { ...item, ...changes } : item)))
}

function startNext(): void {
  while (running.size < CONCURRENCY) {
    const next = items.find((item) => item.status === 'waiting')
    if (!next) return
    running.add(next.id)
    patch(next.id, { status: 'uploading', progress: 0 })
    const handle = startUpload(next.file, next.options, (percent) => {
      if (running.has(next.id)) patch(next.id, { progress: percent })
    })
    active.set(next.id, handle)
    void handle.promise.then((outcome) => {
      running.delete(next.id)
      active.delete(next.id)
      patch(
        next.id,
        outcome.ok
          ? { status: 'done', progress: 100, storedSize: outcome.storedSize, savedPercent: outcome.savedPercent }
          : outcome.canceled
            ? { status: 'canceled' }
            : { status: 'error', message: outcome.message },
      )
      if (outcome.ok) onUploaded?.(outcome)
      startNext()
    })
  }
}

export function enqueueUploads(uploads: readonly QueueUpload[]): void {
  const created = uploads.map((upload): QueueItem => {
    const id = nextId++
    return { id, name: upload.name, size: upload.file.size, file: upload.file, options: upload.options, status: 'waiting', progress: 0 }
  })
  commit([...items, ...created])
  startNext()
}

export function cancelUpload(id: number): void {
  const item = items.find((candidate) => candidate.id === id)
  if (!item || item.status === 'done' || item.status === 'error' || item.status === 'canceled') return
  if (item.status === 'uploading') {
    // Aborting makes the XHR resolve with `canceled`, which marks the row and
    // frees the slot from the queue's own promise handler.
    active.get(id)?.cancel()
  } else {
    patch(id, { status: 'canceled' })
    startNext()
  }
}

export function retryUpload(id: number): void {
  const item = items.find((candidate) => candidate.id === id)
  if (!item || item.status !== 'error') return
  patch(id, { status: 'waiting', progress: 0, message: undefined })
  startNext()
}

/** Removes every terminal row; active uploads stay. */
export function clearFinishedUploads(): void {
  commit(items.filter((item) => item.status === 'waiting' || item.status === 'uploading'))
}

export function getUploadQueue(): QueueItem[] {
  return items
}

export function subscribeToUploadQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The grid refresh after each landed upload; safe to call from effects. */
export function setOnUploaded(callback: ((outcome: UploadOutcome) => void) | undefined): void {
  onUploaded = callback
}

export function useUploadQueue(): QueueItem[] {
  return useSyncExternalStore(subscribeToUploadQueue, getUploadQueue, getUploadQueue)
}
