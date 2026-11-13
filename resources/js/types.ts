/** Props shared with every page by AuthProvider and StashPropsProvider
 *  (ROUTES_SPEC §3). Pages read them with `usePage<SharedProps>()`. */

export interface StashUser {
  id: number
  name: string
  email: string
}

export interface StashCapabilities {
  webp: boolean
  avif: boolean
  maxUploadMb: number
  defaults: {
    format: 'webp' | 'avif' | 'original'
    qualityWebp: number
    qualityAvif: number
  }
}

export interface StashStorage {
  usedBytes: number
  imageCount: number
}

export interface StashFlash {
  success?: string
  error?: string
}

export interface SharedProps {
  auth: { user: StashUser | null }
  capabilities: StashCapabilities
  storage: StashStorage
  publicBaseUrl: string
  flash: StashFlash
}

// Register the app's shared props with Inertia's declaration merge, so plain
// `usePage()` calls come back typed.
declare module '@inertiajs/core' {
  export interface InertiaConfig {
    sharedPageProps: SharedProps
  }
}
