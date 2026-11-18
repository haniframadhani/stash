/** The one place Stash URLs are formatted (docs/IMAGE_PIPELINE.md §6).
 *  The bucket's public domain (`PUBLIC_FILES_BASE_URL`) is the only delivery
 *  path for images: `permanent`, `view` and `thumb` point at the object key so
 *  they work while this local app is off. Without a files domain there is
 *  nothing to share, and the app falls back to its authenticated `/preview`
 *  route for its own browser only.
 */
import type { AppEnv } from '@guren/core'
import { imageKey, thumbKey } from './ImageStore.js'

export interface ImageRef {
  publicId: string
  slug: string
  version: number
  ext: string
}

export interface SnippetOptions extends ImageRef {
  alt?: string
}

export interface SizedSnippetOptions extends SnippetOptions {
  width: number
  height: number
}

/** `{slug}.v{n}.{ext}`, e.g. `sunset-beach.v3.avif` (§4). */
export function versionedFileName(slug: string, version: number, ext: string): string {
  return `${slug}.v${version}.${ext}`
}

/** The preview route's thumb name; distinct from the image by `.thumb.webp`. */
export function previewThumbName(slug: string, version: number): string {
  return `${slug}.v${version}.thumb.webp`
}

export class UrlBuilder {
  constructor(private readonly filesBaseUrl?: string) {}

  /** The bucket's public domain, the only origin a shared link may use. */
  static fromEnv(env: AppEnv): UrlBuilder {
    return new UrlBuilder(env.PUBLIC_FILES_BASE_URL)
  }

  /** The public files domain, when one is configured. */
  get filesBase(): string | undefined {
    return this.filesBaseUrl
  }

  /** Exactly version n on the bucket (pinned, immutable), or null when no
   *  files domain is configured — there is no shareable link in that case. */
  permanent(ref: ImageRef): string | null {
    if (!this.filesBaseUrl) return null
    return this.filePath(imageKey(ref.publicId, ref.version, ref.ext))
  }

  /** What the lightbox loads: the bucket object when configured, otherwise the
   *  authenticated preview route (dev with the local disk). */
  view(publicId: string, slug: string, version: number, ext: string): string {
    if (this.filesBaseUrl) return this.filePath(imageKey(publicId, version, ext))
    return `/preview/${publicId}/${versionedFileName(slug, version, ext)}`
  }

  /** What the grid and list load: the bucket thumbnail when configured,
   *  otherwise the authenticated preview route. */
  thumb(publicId: string, slug: string, version: number): string {
    if (this.filesBaseUrl) return this.filePath(thumbKey(publicId, version))
    return `/preview/${publicId}/${previewThumbName(slug, version)}`
  }

  /** `![alt](permanent url)` for chat apps and Markdown editors; null without
   *  a files domain, because nothing can be embedded. */
  markdown(ref: SnippetOptions): string | null {
    const url = this.permanent(ref)
    if (!url) return null
    return `![${ref.alt ?? ref.slug}](${url})`
  }

  /** `<img src width height alt>`; width/height keep layout from jumping. */
  html(ref: SizedSnippetOptions): string | null {
    const src = this.permanent(ref)
    if (!src) return null
    const alt = escapeHtml(ref.alt ?? ref.slug)
    return `<img src="${src}" width="${ref.width}" height="${ref.height}" alt="${alt}">`
  }

  private filePath(key: string): string {
    return `${this.filesBaseUrl?.replace(/\/+$/, '') ?? ''}/${key}`
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
