import { Controller, HttpException, defer } from '@guren/core'
import type { AppEnv } from '@guren/core'
import { z } from 'zod'
import { pages } from '@/.guren/pages.gen'
import { Folder } from '../../Models/Folder.js'
import { FolderItem, type FolderItemData } from '../Resources/FolderItem.js'
import { Image, type ImageRecord } from '../../Models/Image.js'
import { ImageVersion, type ImageVersionRecord } from '../../Models/ImageVersion.js'
import { ImageItem, type ImageItemData } from '../Resources/ImageItem.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'
import { breadcrumbsFor } from '../../Services/Folders.js'

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

/** The protected drive pages (ROUTES_SPEC §3): `/files` is root, `/files/:id`
 *  (name `drive.folder`) is inside a folder — one action, same prop set. A
 *  trashed or missing folder id is a 404, like the public image routes treat
 *  unreachable images. Everything sits behind the auth middleware on the
 *  routes; the actions only read. */
export default class DriveController extends Controller {
  async index(): Promise<Response> {
    return this.renderDrive(null)
  }

  async folder(): Promise<Response> {
    const { folderId } = await this.validateParams(FolderIdParams)
    // Any segment that is not a positive integer is an unknown folder (404),
    // not a validation error: the URL names a resource, not an input.
    const id = Number(folderId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpException(404, 'Folder not found.')
    return this.renderDrive(id)
  }

  private async renderDrive(folderId: number | null): Promise<Response> {
    const urls = UrlBuilder.fromEnv(this.make<AppEnv>('env'))

    if (folderId === null) {
      return this.inertia(
        pages.drive.Index,
        {
          folder: null,
          breadcrumbs: [{ id: null, name: 'My Files' }],
          folders: await this.childFolders(null),
          // The grid is the page's slow part (one versions query plus N URL
          // builds), so it defers: the shell and toolbar paint first, the images
          // follow on the client's partial reload behind the skeleton.
          images: defer(() => this.folderImages(null).then((images) => toImageItems(images, urls))),
        },
        { title: 'My Files' },
      )
    }

    const folder = await Folder.findOrFail(Number(folderId))
    if (folder.deletedAt !== null) throw new HttpException(404, 'Folder not found.')
    return this.inertia(
      pages.drive.Index,
      {
        folder: new FolderItem(folder).toJSON(),
        breadcrumbs: await breadcrumbsFor(folder),
        folders: await this.childFolders(folder.id),
        images: defer(() => this.folderImages(folder.id).then((images) => toImageItems(images, urls))),
      },
      { title: folder.name },
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

  private childFolders(parentId: number | null): Promise<FolderItemData[]> {
    return Folder.where({ parentId }).whereNull('deletedAt').orderBy('name', 'asc').get()
      .then((rows) => rows.map((row) => new FolderItem(row).toJSON()))
  }

  private folderImages(folderId: number | null): Promise<ImageRecord[]> {
    return Image.where({ folderId }).whereNull('deletedAt').orderBy('name', 'asc').get()
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

/** `/files/:folderId` (drive.folder): a URL segment, not input — any value is
 *  accepted here and resolved into a folder or a 404 in the action. */
const FolderIdParams = z.object({
  folderId: z.string().min(1),
})
