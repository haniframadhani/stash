import { describe, expect, it } from 'bun:test'
import { UrlBuilder, versionedFileName } from '../app/Services/UrlBuilder.js'

const HOST = 'https://stash.example.com'
const withHost = new UrlBuilder(HOST)
const ref = { publicId: 'Ab3xY9kQ2mZ1', slug: 'sunset-beach', version: 3, ext: 'avif' }

// URL forms (docs/IMAGE_PIPELINE.md §4 and §6).
describe('UrlBuilder', () => {
  it('formats the versioned file name', () => {
    expect(versionedFileName('sunset-beach', 3, 'avif')).toBe('sunset-beach.v3.avif')
  })

  it('builds the pinned permanent URL', () => {
    expect(withHost.permanent(ref)).toBe(`${HOST}/i/${ref.publicId}/sunset-beach.v3.avif`)
  })

  it('builds the latest URL with and without the extension', () => {
    expect(withHost.latest(ref.publicId, 'sunset-beach', 'avif')).toBe(`${HOST}/i/${ref.publicId}/sunset-beach.avif`)
    expect(withHost.latest(ref.publicId)).toBe(`${HOST}/i/${ref.publicId}`)
  })

  it('builds the thumb and share-page URLs', () => {
    expect(withHost.thumb(ref.publicId, 'sunset-beach', 3)).toBe(`${HOST}/t/${ref.publicId}/sunset-beach.v3.webp`)
    expect(withHost.page(ref.publicId)).toBe(`${HOST}/p/${ref.publicId}`)
  })

  it('tolerates a trailing slash on the base URL', () => {
    expect(new UrlBuilder(`${HOST}/`).permanent(ref)).toBe(`${HOST}/i/${ref.publicId}/sunset-beach.v3.avif`)
  })

  it('falls back to root-relative URLs without a base', () => {
    expect(new UrlBuilder(undefined).permanent(ref)).toBe(`/i/${ref.publicId}/sunset-beach.v3.avif`)
  })

  it('formats the Markdown and HTML snippets', () => {
    expect(withHost.markdown({ ...ref, alt: 'Sunset' }))
      .toBe(`![Sunset](${HOST}/i/${ref.publicId}/sunset-beach.v3.avif)`)
    expect(withHost.markdown({ ...ref }))
      .toBe(`![sunset-beach](${HOST}/i/${ref.publicId}/sunset-beach.v3.avif)`)
    expect(withHost.html({ ...ref, width: 800, height: 600, alt: 'A "great" <sunset>' }))
      .toBe(`<img src="${HOST}/i/${ref.publicId}/sunset-beach.v3.avif" width="800" height="600" alt="A &quot;great&quot; &lt;sunset&gt;">`)
  })
})
