/** `POST /uploads` (ROUTES_SPEC §4): one multipart upload per request; the
 *  client-side queue sends files one by one so each carries its own progress
 *  and error. Errors from the pipeline map by their own HTTP status
 *  (413 too large, 415 unsupported, 422 bad options or pixels).
 */
import { Controller, HttpException, ValidationException } from '@guren/core'
import type { AppEnv } from '@guren/core'
import type { ImageSettings } from '../../../config/images.js'
import { ImageItem } from '../Resources/ImageItem.js'
import { ImageConversionError } from '../../Services/ImageErrors.js'
import { UrlBuilder } from '../../Services/UrlBuilder.js'
import { storeUpload } from '../../Services/Uploads.js'

export default class UploadController extends Controller {
  async store(): Promise<Response> {
    // Defense in depth: the route already sits behind the auth middleware.
    await this.auth.userOrFail()
    const { body } = this.validated('uploads.store')

    const files = await this.files('file')
    if (files.length === 0) {
      throw ValidationException.withMessages({ file: ['Choose an image to upload.'] })
    }
    // v1 accepts one file per request; a second one waits for the queue (1.6).
    const file = files[0]!

    const stored = await storeUpload({
      bytes: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      folderId: body.folderId ?? null,
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
}
