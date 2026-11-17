import { describe, expect, it } from 'bun:test'
import type { ImageItem } from '../resources/js/types.js'
import { htmlSnippet, isLocalhost, markdownSnippet, snippetFor } from '../resources/js/lib/share.js'

/** Share snippets and the localhost hint (TASKS 3.3). The URLs are
 *  server-built; these functions only frame them. */

function image(overrides: Partial<ImageItem> = {}): ImageItem {
  return {
    id: 1,
    publicId: 'Xk3abc',
    name: 'Sunset beach',
    folderId: null,
    starred: false,
    version: 3,
    format: 'avif',
    mime: 'image/avif',
    size: 100,
    width: 640,
    height: 480,
    createdAt: 1_000,
    updatedAt: 1_000,
    deletedAt: null,
    urls: {
      thumb: 'https://img.test/t/Xk3abc/sunset-beach.v3.webp',
      permanent: 'https://img.test/i/Xk3abc/sunset-beach.v3.avif',
      latest: 'https://img.test/i/Xk3abc/sunset-beach.avif',
      page: 'https://img.test/p/Xk3abc',
    },
    ...overrides,
  }
}

describe('share snippets', () => {
  it('markdown wraps the pinned URL with the image name', () => {
    expect(markdownSnippet(image())).toBe('![Sunset beach](https://img.test/i/Xk3abc/sunset-beach.v3.avif)')
  })

  it('html carries the dimensions and escapes the alt text', () => {
    expect(htmlSnippet(image({ name: 'A "quote" & <tag>' }))).toBe(
      '<img src="https://img.test/i/Xk3abc/sunset-beach.v3.avif" width="640" height="480" alt="A &quot;quote&quot; &amp; &lt;tag&gt;">',
    )
  })

  it('snippetFor picks the tab', () => {
    expect(snippetFor(image(), 'html')).toBe(htmlSnippet(image()))
    expect(snippetFor(image(), 'markdown')).toBe(markdownSnippet(image()))
  })

  it('uses the permanent URL, never the latest one', () => {
    expect(markdownSnippet(image())).toContain('.v3.avif')
  })
})

describe('localhost hint', () => {
  it('flags localhost, 127.0.0.1 and ::1', () => {
    expect(isLocalhost(['http://localhost:3333/i/x'])).toBe(true)
    expect(isLocalhost(['http://127.0.0.1:3333/i/x'])).toBe(true)
    expect(isLocalhost(['http://[::1]:3333/i/x'])).toBe(true)
  })

  it('ignores real hosts and junk', () => {
    expect(isLocalhost(['https://stash.example.com/i/x'])).toBe(false)
    expect(isLocalhost(['http://192.168.1.10:3333/i/x'])).toBe(false)
    // URL('not a url') throws, so it cannot be a localhost link either way.
    expect(isLocalhost(['not a url'])).toBe(false)
  })
})
