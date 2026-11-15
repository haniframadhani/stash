/** The one place Stash URLs are formatted (docs/IMAGE_PIPELINE.md §6).
 *  Absolute URLs use PUBLIC_BASE_URL (APP_URL when unset); without a base they
 *  come out root-relative, which the frontend can prefix itself.
 */
import type { AppEnv } from '@guren/core'

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

export class UrlBuilder {
  constructor(private readonly baseUrl: string | undefined) {}

  /** PUBLIC_BASE_URL wins; APP_URL covers a plain local deployment. */
  static fromEnv(env: AppEnv): UrlBuilder {
    return new UrlBuilder(env.PUBLIC_BASE_URL ?? env.APP_URL)
  }

  /** Exactly version n; content never changes (pinned, immutable). */
  permanent(ref: ImageRef): string {
    return this.path(`i/${ref.publicId}/${versionedFileName(ref.slug, ref.version, ref.ext)}`)
  }

  /** The current version; revalidates. With no slug or ext, the short `/i/{id}` form. */
  latest(publicId: string, slug?: string, ext?: string): string {
    if (slug === undefined || ext === undefined) return this.path(`i/${publicId}`)
    return this.path(`i/${publicId}/${slug}.${ext}`)
  }

  /** Thumbnail of version n, always WebP (pinned, immutable). */
  thumb(publicId: string, slug: string, version: number): string {
    return this.path(`t/${publicId}/${versionedFileName(slug, version, 'webp')}`)
  }

  /** The public share page (HTML, OG tags). */
  page(publicId: string): string {
    return this.path(`p/${publicId}`)
  }

  /** `![alt](permanent url)` for chat apps and Markdown editors. */
  markdown(ref: SnippetOptions): string {
    return `![${ref.alt ?? ref.slug}](${this.permanent(ref)})`
  }

  /** `<img src width height alt>`; width/height keep layout from jumping. */
  html(ref: SizedSnippetOptions): string {
    const src = this.permanent(ref)
    const alt = escapeHtml(ref.alt ?? ref.slug)
    return `<img src="${src}" width="${ref.width}" height="${ref.height}" alt="${alt}">`
  }

  private path(p: string): string {
    const base = this.baseUrl?.replace(/\/+$/, '') ?? ''
    return `${base}/${p}`
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
