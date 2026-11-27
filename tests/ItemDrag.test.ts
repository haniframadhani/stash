import { describe, expect, it } from 'bun:test'
import { isExternalFileDrag } from '../resources/js/lib/itemDrag.js'

/** Task 6.1: the upload overlay must answer only to files dragged in from the
 *  OS. An in-drive card drag carries our own type, and a thumbnail <img> drag
 *  can add `Files` as well, so `Files` alone is not the signal. */

describe('isExternalFileDrag', () => {
  it('accepts an OS file drag', () => {
    expect(isExternalFileDrag(['Files'])).toBe(true)
    expect(isExternalFileDrag(['Files', 'text/plain'])).toBe(true)
  })

  it('rejects an internal item drag, even when the browser adds Files', () => {
    expect(isExternalFileDrag(['application/x-stash-items'])).toBe(false)
    expect(isExternalFileDrag(['Files', 'application/x-stash-items'])).toBe(false)
  })

  it('rejects drags with no files at all', () => {
    expect(isExternalFileDrag([])).toBe(false)
    expect(isExternalFileDrag(['text/plain'])).toBe(false)
  })
})