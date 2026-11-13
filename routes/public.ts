import { Router } from '@guren/core'
import PublicImageController from '../app/Http/Controllers/PublicImageController.js'

// The public image routes (ROUTES_SPEC §1, IMAGE_PIPELINE.md §4 to §5). No
// login, and — via SessionCsrfProvider's prefix exclusions — no Set-Cookie on
// their responses, so shared caches may store them. HEAD is served by the
// same GET handlers (Hono strips the body).
export function registerPublicRoutes(router: Router): void {
  // Pinned (`{slug}.v{n}.{ext}`) and latest-with-extension in one action;
  // the file segment decides which. The slug is cosmetic and ignored.
  router.get('/i/:publicId/:file', [PublicImageController, 'show']).name('image.show')

  // Latest, extension-less: always works, even after a format change.
  router.get('/i/:publicId', [PublicImageController, 'latest']).name('image.latest')

  // Thumbnail of a pinned version; always `.v{n}.webp`.
  router.get('/t/:publicId/:file', [PublicImageController, 'thumb']).name('image.thumb')
}
