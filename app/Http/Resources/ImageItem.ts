/** The drive's image card payload (ROUTES_SPEC §3 `ImageItem`). Built from the
 *  image row plus its current version row, because the version carries the
 *  format, dimensions and size the grid and details panel show. URLs come from
 *  the UrlBuilder so there is exactly one place that shapes them.
 */
import { Resource } from '@guren/core'
import type { ImageRecord } from '../../Models/Image.js'
import type { ImageVersionRecord } from '../../Models/ImageVersion.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'

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
  urls: { thumb: string, permanent: string, latest: string, page: string }
}

export class ImageItem extends Resource<
  { image: ImageRecord, version: ImageVersionRecord },
  ImageItemData
> {
  private readonly urls: UrlBuilder

  constructor(
    input: { image: ImageRecord, version: ImageVersionRecord },
    urls: UrlBuilder,
  ) {
    super(input)
    this.urls = urls
  }

  toArray(): ImageItemData {
    const { image, version } = this.resource
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
        permanent: this.urls.permanent(ref),
        latest: this.urls.latest(image.publicId, image.slug, version.ext),
        page: this.urls.page(image.publicId),
      },
    }
  }
}
