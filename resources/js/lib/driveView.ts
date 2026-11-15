/** Grid/list view and sort state for the drive list (ROUTES_SPEC §3: the common
 *  query params `view`, `sort`, `order`). The state lives in the URL so it
 *  survives a refresh and is deep-linkable; the page keeps it in React and
 *  syncs the address bar with `history.replaceState`, so toggling never
 *  triggers a server round trip (and never re-defers the images prop). */
import type { ImageItem } from '../types.js'

export type ViewMode = 'grid' | 'list'
export type SortKey = 'name' | 'modified' | 'size'
export type SortOrder = 'asc' | 'desc'

export interface DriveView {
  view: ViewMode
  sort: SortKey
  order: SortOrder
}

export const DEFAULT_DRIVE_VIEW: DriveView = { view: 'grid', sort: 'name', order: 'asc' }

const VIEWS: readonly ViewMode[] = ['grid', 'list']
const SORT_KEYS: readonly SortKey[] = ['name', 'modified', 'size']
const ORDERS: readonly SortOrder[] = ['asc', 'desc']

function pick<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return allowed.find((candidate) => candidate === value) ?? null
}

/** Reads the view/sort params from an Inertia page `url` (`/files?view=list`).
 *  Anything unknown falls back to the default, so a hand-edited URL cannot
 *  wedge the page. */
export function readDriveView(pageUrl: string): DriveView {
  let params: URLSearchParams
  try {
    params = new URL(pageUrl, 'http://localhost').searchParams
  } catch {
    return { ...DEFAULT_DRIVE_VIEW }
  }
  const view = pick(VIEWS, params.get('view'))
  const sort = pick(SORT_KEYS, params.get('sort'))
  const order = pick(ORDERS, params.get('order'))
  return {
    view: view ?? DEFAULT_DRIVE_VIEW.view,
    sort: sort ?? DEFAULT_DRIVE_VIEW.sort,
    order: order ?? DEFAULT_DRIVE_VIEW.order,
  }
}

/** The URL for a view state: defaults are omitted, so `/files` stays clean
 *  until the user actually changes something. */
export function driveViewUrl(path: string, view: DriveView): string {
  const params = new URLSearchParams()
  if (view.view !== DEFAULT_DRIVE_VIEW.view) params.set('view', view.view)
  if (view.sort !== DEFAULT_DRIVE_VIEW.sort) params.set('sort', view.sort)
  if (view.order !== DEFAULT_DRIVE_VIEW.order) params.set('order', view.order)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function compareBy(a: ImageItem, b: ImageItem, sort: SortKey): number {
  switch (sort) {
    case 'modified':
      return a.updatedAt - b.updatedAt
    case 'size':
      return a.size - b.size
    case 'name':
      // Case-insensitive, matching the NOCASE ordering the DB uses for siblings.
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  }
}

/** A sorted copy: name (case-insensitive) / modified / size, with the chosen
 *  order and a name-ascending tiebreak so equal sizes keep a stable order. */
export function sortImages(images: ImageItem[], view: DriveView): ImageItem[] {
  const direction = view.order === 'desc' ? -1 : 1
  return [...images].sort((a, b) => {
    const byKey = compareBy(a, b, view.sort)
    if (byKey !== 0) return byKey * direction
    if (view.sort === 'name') return 0
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
