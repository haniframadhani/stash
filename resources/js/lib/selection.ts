/** Selection state for the drive list (UI_SPEC §7): click replaces, Ctrl/Cmd
 *  toggles, Shift extends from the last click. Kept pure and independent of
 *  React so the rules can be tested without a browser; the page only stores
 *  the returned state. */

export interface SelectionState {
  /** Ids of the selected images. IDs are stable, names are not (rename). */
  readonly ids: ReadonlySet<number>
  /** Where a Shift range starts: the last image clicked or toggled. */
  readonly anchorId: number | null
}

export type SelectionMode = 'replace' | 'toggle' | 'extend'

/** The empty selection is a shared value: clearing it twice is a no-op and
 *  setting it as state never re-renders when it is already set. */
export const EMPTY_SELECTION: SelectionState = Object.freeze({
  ids: Object.freeze(new Set<number>()) as ReadonlySet<number>,
  anchorId: null,
})

/** Shift wins over Ctrl/Cmd: a range is what the gesture asks for. */
export function selectionMode(event: {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}): SelectionMode {
  if (event.shiftKey) return 'extend'
  if (event.ctrlKey || event.metaKey) return 'toggle'
  return 'replace'
}

/** Applies one click to the selection. `order` is the visible order (the same
 *  order the grid/list renders), so a Shift range covers what the user sees.
 *  A range unions with the current selection, the way file managers extend a
 *  Ctrl-selected set. */
export function applySelection(
  state: SelectionState,
  order: readonly number[],
  id: number,
  mode: SelectionMode,
): SelectionState {
  if (mode === 'toggle') return toggleSelection(state, id)

  if (mode === 'extend') {
    const anchorIndex = state.anchorId === null ? -1 : order.indexOf(state.anchorId)
    const targetIndex = order.indexOf(id)
    // No usable anchor (first click, or the anchor was sorted out of view):
    // behave like a plain click instead of guessing a range.
    if (anchorIndex === -1 || targetIndex === -1) return { ids: new Set([id]), anchorId: id }
    const start = Math.min(anchorIndex, targetIndex)
    const end = Math.max(anchorIndex, targetIndex)
    const ids = new Set(state.ids)
    for (const selectedId of order.slice(start, end + 1)) ids.add(selectedId)
    return { ids, anchorId: state.anchorId }
  }

  return { ids: new Set([id]), anchorId: id }
}

/** Adds or removes one id; the checkbox path and Ctrl/Cmd+click. */
export function toggleSelection(state: SelectionState, id: number): SelectionState {
  const ids = new Set(state.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ids, anchorId: id }
}

/** Ctrl/Cmd+A: every image in the current folder, anchored at the first. */
export function selectAll(order: readonly number[]): SelectionState {
  return { ids: new Set(order), anchorId: order[0] ?? null }
}

/** Esc and the bar's ✕. */
export function clearSelection(): SelectionState {
  return EMPTY_SELECTION
}
