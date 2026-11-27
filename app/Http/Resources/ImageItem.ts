/** The drive's image card payload (ROUTES_SPEC §3 `ImageItem`). Built from the
 *  image row plus its current version row, because the version carries the
 *  format, dimensions and size the grid and details panel show. URLs come from
 *  the UrlBuilder so there is exactly one place that shapes them.
 */
import { Resource } from '@guren/core'
import type { ImageRecord } from '../../Models/Image.js'
import type { ImageVersionRecord } from '../../Models/ImageVersion.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'

export type ImageVersionItemData = {
  version: number
  format: ImageItemData['format']
  size: number
  width: number
  height: number
  createdAt: number
  isCurrent: boolean
  /** Bucket link pinned to this version; null without a files domain. */
  permanent: string | null
  /** Version-specific source for the panel's Open action (bucket or preview). */
  view: string
}

export type ImageItemData = {
  id: number
  publicId: string
  name: string
  folderId: number | null
  starred: boolean
  version: number
  format: 'avif' | 'webp' | 'jpeg' | 'png' | 'gif'
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  urls: {
    /** What the grid and list load: the files-domain thumbnail, or the private
     *  preview route when no files domain is configured (local disk dev). */
    thumb: string
    /** What the lightbox loads: the files-domain object or the preview route. */
    view: string
    /** The copyable pinned link; null when no files domain is configured, so
     *  there is nothing that would work while the app is off. */
    permanent: string | null
  }
  /** The details panel's list, newest first; omitted on upload/replace answers. */
  versions?: ImageVersionItemData[]
}

export class ImageItem extends Resource<
  { image: ImageRecord, version: ImageVersionRecord, versions?: ImageVersionRecord[] },
  ImageItemData
> {
  private readonly urls: UrlBuilder

  constructor(
    input: { image: ImageRecord, version: ImageVersionRecord, versions?: ImageVersionRecord[] },
    urls: UrlBuilder,
  ) {
    super(input)
    this.urls = urls
  }

  toArray(): ImageItemData {
    const { image, version, versions } = this.resource
    const ref = { publicId: image.publicId, slug: image.slug, version: image.currentVersion, ext: version.ext }
    return {
      id: image.id,
      publicId: image.publicId,
      name: image.name,
      folderId: image.folderId,
      starred: image.starred === 1,
      version: image.currentVersion,
      format: version.format as ImageItemData['format'],
      mime: version.mime,
      size: version.size,
      width: version.width,
      height: version.height,
      // The columns store ISO text; timestamps cross the wire as epoch ms.
      createdAt: Date.parse(image.createdAt),
      updatedAt: Date.parse(image.updatedAt),
      deletedAt: image.deletedAt,
      urls: {
        thumb: this.urls.thumb(image.publicId, image.slug, image.currentVersion),
        view: this.urls.view(image.publicId, image.slug, image.currentVersion, version.ext),
        permanent: this.urls.permanent(ref),
      },
      ...(versions
        ? {
            versions: [...versions]
              .sort((left, right) => right.version - left.version)
              .map((row) => ({
                version: row.version,
                format: row.format as ImageItemData['format'],
                size: row.size,
                width: row.width,
                height: row.height,
                createdAt: Date.parse(row.createdAt),
                isCurrent: row.version === image.currentVersion,
                permanent: this.urls.permanent({ publicId: image.publicId, slug: image.slug, version: row.version, ext: row.ext }),
                view: this.urls.view(image.publicId, image.slug, row.version, row.ext),
              })),
          }
        : {}),
    }
  }
}
