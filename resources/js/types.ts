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

/** One stored image version as the server sends it (ROUTES_SPEC §3; built by
 *  app/Http/Resources/ImageItem.ts). Timestamps arrive as epoch ms; the list is
 *  newest first. */
export interface ImageVersionSummary {
  version: number
  format: 'avif' | 'webp' | 'jpeg' | 'png' | 'gif'
  size: number
  width: number
  height: number
  createdAt: number
  isCurrent: boolean
  /** Bucket link pinned to this version; null without a files domain. */
  permanent: string | null
  /** Version-specific source for the panel's Open action. */
  view: string
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
  /** Absent until the versions payload lands (task 3.2); the lightbox info panel hides the section then. */
  versions?: ImageVersionSummary[]
  urls: {
    /** Grid/list src: the files-domain thumbnail, or the private preview route. */
    thumb: string
    /** Lightbox src: the files-domain object, or the private preview route. */
    view: string
    /** Copyable pinned link; null until PUBLIC_FILES_BASE_URL is set. */
    permanent: string | null
  }
}

/** One folder card as the server sends it (ROUTES_SPEC §3 FolderItem; built by
 *  app/Http/Resources/FolderItem.ts). Timestamps arrive as epoch ms. Folders
 *  have no star in v1 and no server-built URLs; the client links to /files/:id. */
export interface FolderItem {
  id: number
  parentId: number | null
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** One breadcrumb (ROUTES_SPEC §3 Crumb); `id: null` is "My Files". */
export interface Crumb {
  id: number | null
  name: string
}

export interface SharedProps {
  auth: { user: StashUser | null }
  capabilities: StashCapabilities
  storage: StashStorage
  /** Public bucket domain; null means sharing is off (no link can outlive the app). */
  filesBaseUrl: string | null
  flash: StashFlash
}

// Register the app's shared props with Inertia's declaration merge, so plain
// `usePage()` calls come back typed.
declare module '@inertiajs/core' {
  export interface InertiaConfig {
    sharedPageProps: SharedProps
  }
}
