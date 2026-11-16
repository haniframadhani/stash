/** Drag state for in-drive moves (task 2.4). A drag is either a selection of
 *  images or a single folder; both share one payload. Module-level state keeps
 *  the source (grid card, list row, folder card) and any drop target (folder
 *  cards, breadcrumbs, sidebar) in sync without threading React context through
 *  every card. The `application/x-stash-items` type carries it across the
 *  dragover/dragenter/drop pipeline as the dataTransfer contract.
 */

export interface ItemDragPayload {
  imageIds: readonly number[]
  folderIds: readonly number[]
}

const TYPE = 'application/x-stash-items'
const key = (item: ItemDragPayload) => JSON.stringify([item.imageIds, item.folderIds])

let current: string | null = null

/** Starts a drag: keeps module state and the dataTransfer marker in sync. */
export function startDrag(payload: ItemDragPayload, dataTransfer: DataTransfer | null): void {
  const serialized = key(payload)
  current = serialized
  if (dataTransfer) {
    dataTransfer.effectAllowed = 'move'
    dataTransfer.setData(TYPE, serialized)
    dataTransfer.setData('text/plain', serialized)
    const count = payload.imageIds.length + payload.folderIds.length
    if (count > 1) dataTransfer.setDragImage(dragBadge(count), 24, 16)
  }
}

export function dragPayload(): ItemDragPayload | null {
  if (current === null) return null
  try {
    const parsed = JSON.parse(current) as [number[], number[]]
    return { imageIds: parsed[0] ?? [], folderIds: parsed[1] ?? [] }
  } catch {
    current = null
    return null
  }
}

export function clearDrag(): void {
  current = null
}

/** True for a dataTransfer that carried our type. With no dataTransfer (a
 *  guard in a drop handler), the module tracker is the only signal. */
export function isItemDrag(dataTransfer: DataTransfer | null): boolean {
  if (dataTransfer === null) return current !== null
  return Array.from(dataTransfer.types ?? []).includes(TYPE)
}

/** The sidebar's "My Files" drop maps onto a root move. The move state lives in
 *  the drive page (the selection), so the event is the bridge: the sidebar
 *  dispatches it, the drive page answers. */
export const MOVE_TO_ROOT_EVENT = 'stash:move-to-root'

export function requestMoveToRoot(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MOVE_TO_ROOT_EVENT))
}

/** The count badge a multi-selection carries while dragging (UI_SPEC §7). */
function dragBadge(count: number): HTMLElement {
  const badge = document.createElement('div')
  badge.textContent = `${count} items`
  badge.className = 'pointer-events-none fixed left-0 top-0 rounded-full bg-g-accent px-3 py-1 text-xs font-bold text-g-on-accent shadow-g-float'
  document.body.appendChild(badge)
  setTimeout(() => badge.remove(), 0)
  return badge
}