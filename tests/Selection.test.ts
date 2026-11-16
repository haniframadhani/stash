import { describe, expect, it } from 'bun:test'
import {
  EMPTY_SELECTION,
  applySelection,
  clearSelection,
  selectAll,
  selectionMode,
  toggleSelection,
} from '../resources/js/lib/selection.js'

/** The selection rules behind TASKS 2.3 (UI_SPEC §7): click replaces,
 *  Ctrl/Cmd toggles, Shift extends a range in the visible order, Ctrl/Cmd+A
 *  selects the folder, Esc clears. */

const ORDER = [10, 20, 30, 40]

describe('selectionMode', () => {
  it('maps the modifier keys', () => {
    expect(selectionMode({})).toBe('replace')
    expect(selectionMode({ ctrlKey: true })).toBe('toggle')
    expect(selectionMode({ metaKey: true })).toBe('toggle')
    expect(selectionMode({ shiftKey: true })).toBe('extend')
    // Shift+Ctrl is still a range gesture.
    expect(selectionMode({ shiftKey: true, ctrlKey: true })).toBe('extend')
  })
})

describe('applySelection', () => {
  it('replaces the selection on a plain click and moves the anchor', () => {
    const state = applySelection(EMPTY_SELECTION, ORDER, 30, 'replace')
    expect([...state.ids]).toEqual([30])
    expect(state.anchorId).toBe(30)
  })

  it('toggles one id on Ctrl/Cmd+click', () => {
    const first = applySelection(EMPTY_SELECTION, ORDER, 10, 'replace')
    const added = applySelection(first, ORDER, 30, 'toggle')
    expect([...added.ids].sort((a, b) => a - b)).toEqual([10, 30])
    expect(added.anchorId).toBe(30)
    const removed = applySelection(added, ORDER, 10, 'toggle')
    expect([...removed.ids]).toEqual([30])
  })

  it('extends from the anchor in visible order, forwards and backwards', () => {
    let state = applySelection(EMPTY_SELECTION, ORDER, 20, 'replace')
    state = applySelection(state, ORDER, 40, 'extend')
    expect([...state.ids].sort((a, b) => a - b)).toEqual([20, 30, 40])
    // The anchor stays where the range started.
    expect(state.anchorId).toBe(20)

    state = applySelection(state, ORDER, 10, 'extend')
    expect([...state.ids].sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
  })

  it('unions a range with an existing Ctrl selection (the Manual check path)', () => {
    let state = applySelection(EMPTY_SELECTION, ORDER, 10, 'replace')
    state = applySelection(state, ORDER, 20, 'toggle')
    state = applySelection(state, ORDER, 30, 'extend')
    expect([...state.ids].sort((a, b) => a - b)).toEqual([10, 20, 30])
    expect(state.anchorId).toBe(20)
  })

  it('falls back to a plain click when there is no anchor in view', () => {
    const noAnchor = applySelection(EMPTY_SELECTION, ORDER, 30, 'extend')
    expect([...noAnchor.ids]).toEqual([30])
    expect(noAnchor.anchorId).toBe(30)

    // An anchor the current order does not contain (after a folder reload) is stale.
    const stale = applySelection({ ids: new Set([99]), anchorId: 99 }, ORDER, 20, 'extend')
    expect([...stale.ids]).toEqual([20])
    expect(stale.anchorId).toBe(20)
  })
})

describe('selectAll and clearSelection', () => {
  it('selects every id in order and anchors at the first', () => {
    const state = selectAll(ORDER)
    expect([...state.ids]).toEqual(ORDER)
    expect(state.anchorId).toBe(10)
  })

  it('selects nothing in an empty folder', () => {
    const state = selectAll([])
    expect(state.ids.size).toBe(0)
    expect(state.anchorId).toBeNull()
  })

  it('clears to the shared empty state', () => {
    const cleared = clearSelection()
    expect(cleared.ids.size).toBe(0)
    expect(cleared.anchorId).toBeNull()
    expect(cleared).toBe(EMPTY_SELECTION)
  })
})

describe('toggleSelection', () => {
  it('never mutates the previous state', () => {
    const start = applySelection(EMPTY_SELECTION, ORDER, 10, 'replace')
    const next = toggleSelection(start, 20)
    expect([...start.ids]).toEqual([10])
    expect([...next.ids].sort((a, b) => a - b)).toEqual([10, 20])
  })
})
