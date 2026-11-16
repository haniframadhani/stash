/** Image mutations (ROUTES_SPEC §4): PATCH /images/:id renames an image. The
 *  rename answers a redirect (303 for Inertia) back to the folder the image
 *  lives in, and never touches `current_version` or any stored object — every
 *  permanent link keeps working, since lookups match `publicId` only.
 *  `folderId` and `starred` arrive with the Move (2.4) and Star (4.1) tasks.
 */
import { Controller, HttpException } from '@guren/core'
import { Image, type ImageRecord } from '../../Models/Image.js'
import type { UserRecord } from '../../Models/User.js'
import { renameImage } from '../../Services/Images.js'

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
