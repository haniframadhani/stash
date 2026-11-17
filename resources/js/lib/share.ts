/** Share snippets and the localhost hint (UI_SPEC §5, task 3.3). Pure string
 *  work so it can be unit-tested without a browser: the URLs themselves come
 *  from the server ImageItem (UrlBuilder), never rebuilt here. Because those
 *  URLs are server-built, HTML escaping only has to handle the alt text. */
import type { ImageItem } from '../types.js'

export type EmbedFormat = 'markdown' | 'html'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** `![name](permanent url)` — the pinned version, so a later replace never
 *  changes what an embed shows. */
export function markdownSnippet(image: ImageItem): string {
  return `![${image.name}](${image.urls.permanent})`
}

/** `<img src width height alt>`; width/height stop layout shift. */
export function htmlSnippet(image: ImageItem): string {
  return `<img src="${image.urls.permanent}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.name)}">`
}

export function snippetFor(image: ImageItem, format: EmbedFormat): string {
  return format === 'html' ? htmlSnippet(image) : markdownSnippet(image)
}

/** True when any link points at localhost: only this machine can reach it. */
export function isLocalhost(urls: string[]): boolean {
  const patterns = [/(^|\.)localhost(:\d+)?$/i, /^127\.0\.0\.1(:\d+)?$/, /^\[?::1\]?(:\d+)?$/]
  return urls.some((value) =>
    patterns.some((pattern) => {
      try {
        return pattern.test(new URL(value).host)
      } catch {
        return false
      }
    }),
  )
}
