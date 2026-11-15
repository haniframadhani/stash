import { describe, expect, it } from 'bun:test'
import { toSlug } from '../app/Services/Slug.js'

// Slug edge cases (docs/IMAGE_PIPELINE.md §8: unicode, emoji, empty, very long).
describe('toSlug', () => {
  it('lowercases and dashes plain names', () => {
    expect(toSlug('Sunset beach')).toBe('sunset-beach')
    expect(toSlug('Sunset_beach.JPG')).toBe('sunset-beach-jpg')
  })

  it('drops diacritics via NFKD', () => {
    expect(toSlug('Café Münchën')).toBe('cafe-munchen')
    expect(toSlug('Ångström unit')).toBe('angstrom-unit')
  })

  it('reduces emoji and CJK names to dashes', () => {
    expect(toSlug('🎉 Party Time!')).toBe('party-time')
    expect(toSlug('日本語 テスト')).toBe('image')
  })

  it('falls back to "image" for empty input', () => {
    expect(toSlug('')).toBe('image')
    expect(toSlug('   ')).toBe('image')
    expect(toSlug('///')).toBe('image')
  })

  it('collapses repeated separators', () => {
    expect(toSlug('a  --  b')).toBe('a-b')
    expect(toSlug('--a--b--')).toBe('a-b')
  })

  it('caps at 60 chars without a trailing dash', () => {
    const long = `${'abcdefghij'.repeat(8)}-tail` // 84 chars
    const slug = toSlug(long)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.startsWith('abcdefghij')).toBe(true)
  })
})
