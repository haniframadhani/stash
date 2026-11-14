import { Controller } from '@guren/core'
import type { AppEnv } from '@guren/core'
import { pages } from '@/.guren/pages.gen'
import { Folder } from '../../Models/Folder.js'
import { Image, type ImageRecord } from '../../Models/Image.js'
import { ImageVersion, type ImageVersionRecord } from '../../Models/ImageVersion.js'
import { ImageItem, type ImageItemData } from '../Resources/ImageItem.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'

// Minimal list shapes until later tasks swap them for API Resources with URLs.
export interface FolderSummary {
  id: number
  name: string
}

export interface ImageSummary {
  id: number
  name: string
  starred: boolean
}

/** Current version rows for a page of images: one query, joined in memory
 *  (`(imageId, version)` is unique and `currentVersion` points at one of them). */
async function toImageItems(images: ImageRecord[], urls: UrlBuilder): Promise<ImageItemData[]> {
  if (images.length === 0) return []
  const versions = await ImageVersion.whereIn('imageId', images.map((image) => image.id)).get()
  const current = new Map<number, ImageVersionRecord>()
  for (const version of versions) {
    const image = images.find((candidate) => candidate.id === version.imageId)
    if (image && version.version === image.currentVersion) current.set(image.id, version)
  }
  return images.map((image) => {
    const version = current.get(image.id)
    if (!version) throw new Error(`Image ${image.id} has no row for its current version ${image.currentVersion}`)
    return new ImageItem({ image, version }, urls).toJSON()
  })
}

/** The protected drive pages (ROUTES_SPEC §3). Everything is behind the auth
 *  middleware registered on the routes; the actions only read. */
export default class DriveController extends Controller {
  async index(): Promise<Response> {
    const urls = UrlBuilder.fromEnv(this.make<AppEnv>('env'))
    const [folders, images] = await Promise.all([this.rootFolders(), this.rootImages()])
    return this.inertia(
      pages.drive.Index,
      { folder: null, breadcrumbs: [], folders, images: await toImageItems(images, urls) },
      { title: 'My Files' },
    )
  }

  async recent(): Promise<Response> {
    const images = (await Image.whereNull('deletedAt').orderBy('createdAt', 'desc').limit(100).get()).map(toImageSummary)
    return this.inertia(pages.drive.Recent, { images }, { title: 'Recent' })
  }

  async starred(): Promise<Response> {
    const images = (await Image.where({ starred: 1 }).whereNull('deletedAt').orderBy('name', 'asc').get()).map(toImageSummary)
    return this.inertia(pages.drive.Starred, { folders: [], images }, { title: 'Starred' })
  }

  async trash(): Promise<Response> {
    const [folders, images] = await Promise.all([
      // Only top-level trashed folders: a trashed parent hides its descendants,
      // which the recursive check in task 4.2 refines.
      Folder.whereNotNull('deletedAt').whereNull('parentId').orderBy('name', 'asc').get(),
      Image.whereNotNull('deletedAt').orderBy('name', 'asc').get(),
    ])
    return this.inertia(
      pages.drive.Trash,
      { folders: folders.map(toFolderSummary), images: images.map(toImageSummary) },
      { title: 'Trash' },
    )
  }

  private rootFolders() {
    return Folder.whereNull('parentId').whereNull('deletedAt').orderBy('name', 'asc').get()
      .then((rows) => rows.map(toFolderSummary))
  }

  private rootImages(): Promise<ImageRecord[]> {
    return Image.where({ folderId: null }).whereNull('deletedAt').orderBy('name', 'asc').get()
  }
}

const toFolderSummary = (folder: { id: number, name: string }): FolderSummary => ({
  id: folder.id,
  name: folder.name,
})

const toImageSummary = (image: { id: number, name: string, starred: number }): ImageSummary => ({
  id: image.id,
  name: image.name,
  starred: image.starred === 1,
})
