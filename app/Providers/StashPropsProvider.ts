/** Shared Inertia props on every private page (ROUTES_SPEC §3):
 *  `capabilities`, `storage`, `publicBaseUrl` and `flash`. `auth` stays with
 *  the auth scaffold's AuthProvider; this one must be listed after it, so its
 *  props merge over.
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
    // Copied share links must reach the app from outside; PUBLIC_BASE_URL wins
    // because APP_URL can stay a LAN address.
    const publicBaseUrl = env.PUBLIC_BASE_URL ?? env.APP_URL

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
        publicBaseUrl,
        flash: flash ?? {},
      }
    }, this.container)
  }
}
