import { describe, expect, it } from 'bun:test'
import { uniqueName } from '../app/Services/NamePolicy.js'

// Name clashes get a ` (1)` suffix (PLANNING.md §6; ROUTES_SPEC §4).
describe('uniqueName', () => {
  it('keeps a free name untouched', async () => {
    const taken = new Set<string>()
    expect(await uniqueName('Trips', (name) => Promise.resolve(taken.has(name.toLowerCase())))).toBe('Trips')
  })

  it('suffixes the first clash with (1)', async () => {
    const taken = new Set(['trips'])
    let candidate = ''
    const name = await uniqueName('Trips', (name) => {
      candidate = name
      return Promise.resolve(taken.has(name.toLowerCase()))
    })
    expect(name).toBe('Trips (1)')
    expect(candidate).toBe('Trips (1)')
  })

  it('walks past taken suffixes', async () => {
    const taken = new Set(['trips', 'trips (1)', 'trips (2)'])
    expect(await uniqueName('Trips', (name) => Promise.resolve(taken.has(name.toLowerCase())))).toBe('Trips (3)')
  })
})
