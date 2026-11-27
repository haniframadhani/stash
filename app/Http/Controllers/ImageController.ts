/** Image mutations (ROUTES_SPEC §4): PATCH /images/:id renames an image and
 *  POST /images/:id/versions replaces it with version n+1. The rename answers a
 *  redirect (303 for Inertia) back to the folder the image lives in, and never
 *  touches `current_version` or any stored object — every permanent link keeps
 *  working, since lookups match `publicId` only. `folderId` and `starred`
 *  arrive with the Move (2.4) and Star (4.1) tasks.
 */
import { Controller, HttpException, ValidationException } from '@guren/core'
import type { AppEnv } from '@guren/core'
import type { ImageSettings } from '../../../config/images.js'
import { Image, type ImageRecord } from '../../Models/Image.js'
import { ImageVersion } from '../../Models/ImageVersion.js'
import type { UserRecord } from '../../Models/User.js'
import { ImageItem } from '../Resources/ImageItem.js'
import { ImageConversionError } from '../../Services/ImageErrors.js'
import { renameImage } from '../../Services/Images.js'
import { replaceImage } from '../../Services/Uploads.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'

export default class ImageController extends Controller {
  async update(): Promise<Response> {
    // Defense in depth: the route already sits behind the auth middleware.
    await this.auth.userOrFail<UserRecord>()
    const { params, body } = this.validated('images.update')

    const image = await this.activeImage(Number(params.id))
    if (body.name !== undefined) {
      await renameImage(image, body.name)
    }
    return this.redirect(redirectTargetFor(image.folderId))
  }

  /** `images.replace` (docs/IMAGE_PIPELINE.md §7): JSON like `uploads.store`,
   *  so the dialog can show the same savings; the old versions keep their keys. */
  async replace(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { params, body } = this.validated('images.replace')
    const image = await this.activeImage(Number(params.id))

    const files = await this.files('file')
    if (files.length === 0) {
      throw ValidationException.withMessages({ file: ['Choose a replacement image.'] })
    }
    const file = files[0]!

    const stored = await replaceImage({
      image,
      bytes: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      options: body,
      settings: this.make<ImageSettings>('images'),
    }).catch((error: unknown) => {
      if (error instanceof ImageConversionError) throw new HttpException(error.status, error.message)
      throw error
    })

    const urls = UrlBuilder.fromEnv(this.make<AppEnv>('env'))
    return this.created({
      image: new ImageItem({ image: stored.image, version: stored.version }, urls).toJSON(),
      originalSize: stored.saved.originalSize,
      storedSize: stored.saved.storedSize,
      savedBytes: stored.saved.savedBytes,
      savedPercent: stored.saved.savedPercent,
    })
  }

  /** `images.restoreVersion` (docs/IMAGE_PIPELINE.md §4): "Make current" moves
   *  only the pointer. The version's object already exists, so nothing is
   *  written and no pinned link changes; a pruned or unknown version is a 404. */
  async restoreVersion(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { params } = this.validated('images.restoreVersion')
    const image = await this.activeImage(Number(params.id))
    const version = Number(params.version)

    const row = await ImageVersion.first({ imageId: image.id, version })
    if (!row) throw new HttpException(404, 'Version not found.')

    await Image.update(
      { id: image.id },
      { currentVersion: version },
      { set: { updatedAt: new Date().toISOString() } },
    )
    return this.redirect(redirectTargetFor(image.folderId))
  }

  /** `:id` names an active image; unknown ids 404 via `findOrFail`, trashed
   *  ones are just as unreachable for management. */
  private async activeImage(id: number): Promise<ImageRecord> {
    const image = await Image.findOrFail(id)
    if (image.deletedAt !== null) throw new HttpException(404, 'Image not found.')
    return image
  }
}

/** Back to where the renamed image is visible: its folder's page, or My Files
 *  at root. */
function redirectTargetFor(folderId: number | null): string {
  return folderId === null ? '/files' : `/files/${folderId}`
}
