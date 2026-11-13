import { Controller } from '@guren/core'
import { pages } from '@/.guren/pages.gen'
import { Folder } from '../../Models/Folder.js'
import { Image } from '../../Models/Image.js'

// Minimal list shapes until task 1.4 swaps them for API Resources with URLs.
export interface FolderSummary {
  id: number
  name: string
}

export interface ImageSummary {
  id: number
  name: string
  starred: boolean
}

/** The protected drive pages (ROUTES_SPEC §3). Everything is behind the auth
 *  middleware registered on the routes; the actions only read. */
export default class DriveController extends Controller {
  async index(): Promise<Response> {
    const [folders, images] = await Promise.all([this.rootFolders(), this.rootImages()])
    return this.inertia(pages.drive.Index, { folder: null, breadcrumbs: [], folders, images }, { title: 'My Files' })
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

  private rootImages() {
    return Image.where({ folderId: null }).whereNull('deletedAt').orderBy('name', 'asc').get()
      .then((rows) => rows.map(toImageSummary))
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
