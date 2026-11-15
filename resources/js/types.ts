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

/** One image card as the server sends it (ROUTES_SPEC §3 ImageItem; built by
 *  app/Http/Resources/ImageItem.ts). Timestamps arrive as epoch ms. */
export interface ImageItem {
  id: number
  publicId: string
  name: string
  folderId: number | null
  starred: boolean
  version: number
  format: 'avif' | 'webp' | 'jpeg' | 'png' | 'gif'
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  urls: { thumb: string, permanent: string, latest: string, page: string }
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
