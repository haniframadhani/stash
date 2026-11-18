/** Share snippets (UI_SPEC §5, tasks 3.3 and 6.3). Pure string work so it can
 *  be unit-tested without a browser: the URLs themselves come from the server
 *  ImageItem (UrlBuilder), never rebuilt here. Because those URLs are
 *  server-built, HTML escaping only has to handle the alt text. No files
 *  domain means no shareable link at all — the app is local and its preview
 *  routes die with it.
 */
import type { ImageItem } from '../types.js'

export type EmbedFormat = 'markdown' | 'html'

/** One copyable link row in the Share dialog (UI_SPEC §5). */
export interface ShareLink {
  key: 'permanent' | 'thumb'
  label: string
  hint: string
  url: string
}

/** The bucket-served links worth handing out; empty without a files domain,
 *  because anything on the app origin stops working when the app is off. */
export function shareLinks(image: Pick<ImageItem, 'urls'>): ShareLink[] {
  const permanent = image.urls.permanent
  if (!permanent) return []
  return [
    {
      key: 'permanent',
      label: 'This version',
      hint: 'Permanent. Never changes.',
      url: permanent,
    },
    {
      key: 'thumb',
      label: 'Thumbnail',
      hint: '320 px wide. Permanent.',
      // In files mode the grid URL is the bucket object; in preview mode it is
      // the private route and there is no permanent link either.
      url: image.urls.thumb,
    },
  ]
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** `![name](permanent url)` — the pinned version, so a later replace never
 *  changes what an embed shows; null without a files domain. */
export function markdownSnippet(image: ImageItem): string | null {
  if (!image.urls.permanent) return null
  return `![${image.name}](${image.urls.permanent})`
}

/** `<img src width height alt>`; width/height stop layout shift. */
export function htmlSnippet(image: ImageItem): string | null {
  if (!image.urls.permanent) return null
  return `<img src="${image.urls.permanent}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.name)}">`
}

export function snippetFor(image: ImageItem, format: EmbedFormat): string | null {
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
