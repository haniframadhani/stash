import { describe, expect, it } from 'bun:test'
import type { ImageItem } from '../resources/js/types.js'
import { htmlSnippet, isLocalhost, markdownSnippet, shareLinks, snippetFor } from '../resources/js/lib/share.js'

/** Share snippets and links (TASKS 3.3 and 6.3). The URLs are server-built;
 *  these functions only frame them. Only bucket URLs are ever offered, because
 *  this app is local and stops answering when it is closed. */

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
      thumb: 'https://files.test/images/Xk3abc/v3.thumb.webp',
      view: 'https://files.test/images/Xk3abc/v3.avif',
      permanent: 'https://files.test/images/Xk3abc/v3.avif',
    },
    ...overrides,
  }
}

/** The same image with no files domain: the app may show it, nobody can share it. */
function previewImage(): ImageItem {
  return image({
    urls: {
      thumb: '/preview/Xk3abc/sunset-beach.v3.thumb.webp',
      view: '/preview/Xk3abc/sunset-beach.v3.avif',
      permanent: null,
    },
  })
}

describe('share links', () => {
  it('offers the pinned version and its thumbnail, both bucket-served', () => {
    const links = shareLinks(image())
    expect(links.map((link) => link.key)).toEqual(['permanent', 'thumb'])
    for (const link of links) expect(link.url.startsWith('https://files.test/images/')).toBe(true)
  })

  it('offers nothing without a files domain', () => {
    expect(shareLinks(previewImage())).toEqual([])
  })
})

describe('share snippets', () => {
  it('markdown wraps the pinned URL with the image name', () => {
    expect(markdownSnippet(image())).toBe('![Sunset beach](https://files.test/images/Xk3abc/v3.avif)')
  })

  it('html carries the dimensions and escapes the alt text', () => {
    expect(htmlSnippet(image({ name: 'A "quote" & <tag>' }))).toBe(
      '<img src="https://files.test/images/Xk3abc/v3.avif" width="640" height="480" alt="A &quot;quote&quot; &amp; &lt;tag&gt;">',
    )
  })

  it('snippetFor picks the tab', () => {
    expect(snippetFor(image(), 'html')).toBe(htmlSnippet(image()))
    expect(snippetFor(image(), 'markdown')).toBe(markdownSnippet(image()))
  })

  it('never embeds the private preview route', () => {
    expect(markdownSnippet(previewImage())).toBeNull()
    expect(htmlSnippet(previewImage())).toBeNull()
    expect(snippetFor(previewImage(), 'markdown')).toBeNull()
  })
})

describe('localhost hint', () => {
  it('flags localhost, 127.0.0.1 and ::1', () => {
    expect(isLocalhost(['http://localhost:3333/images/x'])).toBe(true)
    expect(isLocalhost(['http://127.0.0.1:3333/images/x'])).toBe(true)
    expect(isLocalhost(['http://[::1]:3333/images/x'])).toBe(true)
  })

  it('ignores real hosts and junk', () => {
    expect(isLocalhost(['https://files.example.com/images/x'])).toBe(false)
    expect(isLocalhost(['http://192.168.1.10:3333/images/x'])).toBe(false)
    // URL('not a url') throws, so it cannot be a localhost link either way.
    expect(isLocalhost(['not a url'])).toBe(false)
  })
})
