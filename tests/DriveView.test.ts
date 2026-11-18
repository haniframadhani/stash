import { describe, expect, it } from 'bun:test'
import type { ImageItem } from '../resources/js/types.js'
import { DEFAULT_DRIVE_VIEW, driveViewUrl, readDriveView, sortImages } from '../resources/js/lib/driveView.js'

/** The client's view/sort state (TASKS 1.5): URL params, clamped, and a pure
 *  comparator the grid and list views share. */

let nextId = 1
function image(overrides: Partial<ImageItem> = {}): ImageItem {
  const id = nextId++
  return {
    id,
    publicId: `pub${id}`,
    name: `image-${id}`,
    folderId: null,
    starred: false,
    version: 1,
    format: 'webp',
    mime: 'image/webp',
    size: 100,
    width: 640,
    height: 480,
    createdAt: 1_000,
    updatedAt: 1_000,
    deletedAt: null,
    urls: { thumb: '/preview/thumb', view: '/preview/view', permanent: null },
    ...overrides,
  }
}

describe('readDriveView', () => {
  it('returns the defaults for a plain URL', () => {
    expect(readDriveView('/files')).toEqual(DEFAULT_DRIVE_VIEW)
    expect(readDriveView('/files')).toEqual({ view: 'grid', sort: 'name', order: 'asc' })
  })

  it('reads view, sort and order', () => {
    expect(readDriveView('/files?view=list&sort=size&order=desc')).toEqual({
      view: 'list',
      sort: 'size',
      order: 'desc',
    })
  })

  it('clamps unknown values back to the defaults', () => {
    expect(readDriveView('/files?view=table&sort=hype&order=sideways')).toEqual(DEFAULT_DRIVE_VIEW)
    // A partial override keeps the defaults for the rest.
    expect(readDriveView('/files?sort=modified')).toEqual({ view: 'grid', sort: 'modified', order: 'asc' })
  })
})

describe('driveViewUrl', () => {
  it('omits every default, so /files stays clean', () => {
    expect(driveViewUrl('/files', DEFAULT_DRIVE_VIEW)).toBe('/files')
  })

  it('keeps only the non-default params', () => {
    expect(driveViewUrl('/files', { view: 'list', sort: 'name', order: 'asc' })).toBe('/files?view=list')
    expect(driveViewUrl('/files', { view: 'list', sort: 'modified', order: 'desc' })).toBe(
      '/files?view=list&sort=modified&order=desc',
    )
  })
})

describe('sortImages', () => {
  it('sorts by name case-insensitively and does not mutate the input', () => {
    const a = image({ name: 'alpha', size: 1 })
    const b = image({ name: 'Zulu', size: 2 })
    const c = image({ name: 'mike', size: 3 })
    const input = [c, a, b]
    const sorted = sortImages(input, { view: 'grid', sort: 'name', order: 'asc' })
    expect(sorted.map((item) => item.name)).toEqual(['alpha', 'mike', 'Zulu'])
    expect(input.map((item) => item.name)).toEqual(['mike', 'alpha', 'Zulu'])
  })

  it('sorts by modified and by size, ascending and descending', () => {
    const old = image({ name: 'old', updatedAt: 100, size: 10 })
    const new_ = image({ name: 'new', updatedAt: 200, size: 5 })
    expect(sortImages([old, new_], { view: 'grid', sort: 'modified', order: 'asc' }).map((item) => item.name)).toEqual([
      'old',
      'new',
    ])
    expect(sortImages([old, new_], { view: 'grid', sort: 'modified', order: 'desc' }).map((item) => item.name)).toEqual([
      'new',
      'old',
    ])
    expect(sortImages([old, new_], { view: 'grid', sort: 'size', order: 'desc' }).map((item) => item.name)).toEqual([
      'old',
      'new',
    ])
  })

  it('breaks ties by name ascending regardless of order', () => {
    const big1 = image({ name: 'zeta', size: 50 })
    const big2 = image({ name: 'alfa', size: 50 })
    expect(sortImages([big1, big2], { view: 'grid', sort: 'size', order: 'desc' }).map((item) => item.name)).toEqual([
      'alfa',
      'zeta',
    ])
  })
})
