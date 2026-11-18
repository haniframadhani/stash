import { describe, expect, it } from 'bun:test'
import { UrlBuilder, previewThumbName, versionedFileName } from '../app/Services/UrlBuilder.js'

const FILES = 'https://files.example.com'
const noFiles = new UrlBuilder()
const withFiles = new UrlBuilder(FILES)
const ref = { publicId: 'Ab3xY9kQ2mZ1', slug: 'sunset-beach', version: 3, ext: 'avif' }

// URL forms (docs/IMAGE_PIPELINE.md §4 and §6). The bucket is the only place a
// shareable image link may point; the app route is a private preview.
describe('UrlBuilder without a files domain', () => {
  it('has no shareable permanent link', () => {
    expect(noFiles.permanent(ref)).toBeNull()
    expect(noFiles.markdown({ ...ref })).toBeNull()
    expect(noFiles.html({ ...ref, width: 800, height: 600 })).toBeNull()
  })

  it('points the grid and lightbox at the private preview route', () => {
    expect(noFiles.thumb(ref.publicId, ref.slug, 3)).toBe(`/preview/${ref.publicId}/sunset-beach.v3.thumb.webp`)
    expect(noFiles.view(ref.publicId, ref.slug, 3, ref.ext)).toBe(`/preview/${ref.publicId}/sunset-beach.v3.avif`)
    expect(noFiles.filesBase).toBeUndefined()
  })

  it('formats the versioned names', () => {
    expect(versionedFileName('sunset-beach', 3, 'avif')).toBe('sunset-beach.v3.avif')
    expect(previewThumbName('sunset-beach', 3)).toBe('sunset-beach.v3.thumb.webp')
  })
})

describe('UrlBuilder with PUBLIC_FILES_BASE_URL', () => {
  it('points the pinned link and snippets at the object key', () => {
    expect(withFiles.permanent(ref)).toBe(`${FILES}/images/${ref.publicId}/v3.avif`)
    expect(withFiles.markdown({ ...ref, alt: 'Sunset' })).toBe(`![Sunset](${FILES}/images/${ref.publicId}/v3.avif)`)
    expect(withFiles.markdown({ ...ref })).toBe(`![sunset-beach](${FILES}/images/${ref.publicId}/v3.avif)`)
    expect(withFiles.html({ ...ref, width: 800, height: 600, alt: 'A "great" <sunset>' }))
      .toBe(`<img src="${FILES}/images/${ref.publicId}/v3.avif" width="800" height="600" alt="A &quot;great&quot; &lt;sunset&gt;">`)
  })

  it('loads the grid, the lightbox and the shareable thumbnail from the bucket', () => {
    expect(withFiles.thumb(ref.publicId, ref.slug, 3)).toBe(`${FILES}/images/${ref.publicId}/v3.thumb.webp`)
    expect(withFiles.view(ref.publicId, ref.slug, 3, ref.ext)).toBe(`${FILES}/images/${ref.publicId}/v3.avif`)
    expect(withFiles.filesBase).toBe(FILES)
  })

  it('tolerates a trailing slash on the files base', () => {
    expect(new UrlBuilder(`${FILES}/`).permanent(ref)).toBe(`${FILES}/images/${ref.publicId}/v3.avif`)
  })
})
