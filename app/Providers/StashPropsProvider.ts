/** Shared Inertia props on every private page (ROUTES_SPEC §3):
 *  `capabilities`, `storage`, `filesBaseUrl` and `flash`.
 *  `auth` stays with the auth scaffold's AuthProvider; this one must be listed
 *  after it, so its props merge over.
 */
import { ServiceProvider, shareInertiaProps, getSessionFromContext, type AppEnv } from '@guren/core'
import type { ImageSettings } from '../../config/images.js'
import { probeCapabilities } from '../Services/ImageCapabilities.js'
import { storageUsage } from '../Services/StorageMeter.js'

export interface StashFlash {
  success?: string
  error?: string
}

export default class StashPropsProvider extends ServiceProvider {
  register(): void {}

  boot(): void {
    const settings = this.container.make<ImageSettings>('images')
    const env = this.container.make<AppEnv>('env')
    // The app is local and never internet-facing, so every shareable URL comes
    // from the bucket's public domain. Unset means the Share dialog has nothing
    // to offer (preview routes are private and die with the app).
    const filesBaseUrl = env.PUBLIC_FILES_BASE_URL ?? null

    shareInertiaProps(async (ctx) => {
      const capabilities = await probeCapabilities()
      const flash = getSessionFromContext(ctx)?.getFlash<StashFlash>('flash')
      return {
        capabilities: {
          webp: capabilities.webp,
          avif: capabilities.avif,
          maxUploadMb: Math.round(settings.maxUploadBytes / 1024 / 1024),
          defaults: {
            format: settings.defaultFormat,
            qualityWebp: settings.defaultQualityWebp,
            qualityAvif: settings.defaultQualityAvif,
          },
        },
        storage: await storageUsage(),
        filesBaseUrl,
        flash: flash ?? {},
      }
    }, this.container)
  }
}
