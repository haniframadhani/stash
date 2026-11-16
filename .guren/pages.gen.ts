// Generated from resources/js/pages — DO NOT EDIT
// Run `guren codegen` to regenerate.

import type { PageContract, PagePropsRecord } from '@guren/inertia-client'
import type { SelectModifiers } from '../resources/js/components/drive/ImageCard.js'
import type { RenameTarget } from '../resources/js/components/drive/RenameInput.js'
import type { DriveView } from '../resources/js/lib/driveView.js'
import type { ItemDragPayload } from '../resources/js/lib/itemDrag.js'
import type { SelectionState } from '../resources/js/lib/selection.js'
import type { Crumb, FolderItem, ImageItem } from '../resources/js/types.js'
import type { ValidationErrors } from '@guren/core'


export const pageManifest = {
  'auth/Login': './pages/auth/Login.tsx',
  'drive/Index': './pages/drive/Index.tsx',
  'drive/Recent': './pages/drive/Recent.tsx',
  'drive/Starred': './pages/drive/Starred.tsx',
  'drive/Trash': './pages/drive/Trash.tsx',
  'profile/Edit': './pages/profile/Edit.tsx',
} as const

export type PageManifest = typeof pageManifest
export type PageId = keyof PageManifest
export type PagePath<TPage extends PageId = PageId> = PageManifest[TPage]

export const pageIds = Object.keys(pageManifest) as PageId[]

export function isPageId(value: string): value is PageId {
  return Object.prototype.hasOwnProperty.call(pageManifest, value)
}

interface ImageSummary {
  id: number
  name: string
  starred: boolean
}
/**
 * Auto-extracted Props types from page components.
 */
export interface PagePropsMap {
  'auth/Login': {
  email?: string
  errors?: ValidationErrors<'email' | 'password'>
}
  'drive/Index': {
  folder: FolderItem | null
  breadcrumbs: Crumb[]
  folders: FolderItem[]
  images?: ImageItem[]
  moveTargets: FolderItem[]
}
  'drive/Recent': {
  images: ImageSummary[]
}
  'drive/Starred': {
  folders: { id: number, name: string }[]
  images: ImageSummary[]
}
  'drive/Trash': {
  folders: { id: number, name: string }[]
  images: { id: number, name: string, starred: boolean }[]
}
  'profile/Edit': {
  profile: { name: string; email: string }
  errors?: ValidationErrors<'name' | 'email' | 'password' | 'currentPassword'>
  status?: string
}
}

export type InferPageProps<TId extends PageId> =
  TId extends keyof PagePropsMap ? PagePropsMap[TId] : Record<string, never>

function defineGeneratedPage<TId extends string, TProps extends PagePropsRecord = Record<string, never>>(
  id: TId,
  path: string,
): PageContract<TId, TProps> {
  return {
    id,
    component: id,
    path,
    props<TNextProps extends PagePropsRecord>() {
      return defineGeneratedPage(id, path) as PageContract<TId, TNextProps>
    },
  } as PageContract<TId, TProps>
}

export const pages = {
  auth: {
    Login: defineGeneratedPage<'auth/Login', PagePropsMap['auth/Login']>('auth/Login', pageManifest['auth/Login'])
  },
  drive: {
    Index: defineGeneratedPage<'drive/Index', PagePropsMap['drive/Index']>('drive/Index', pageManifest['drive/Index']),
    Recent: defineGeneratedPage<'drive/Recent', PagePropsMap['drive/Recent']>('drive/Recent', pageManifest['drive/Recent']),
    Starred: defineGeneratedPage<'drive/Starred', PagePropsMap['drive/Starred']>('drive/Starred', pageManifest['drive/Starred']),
    Trash: defineGeneratedPage<'drive/Trash', PagePropsMap['drive/Trash']>('drive/Trash', pageManifest['drive/Trash'])
  },
  profile: {
    Edit: defineGeneratedPage<'profile/Edit', PagePropsMap['profile/Edit']>('profile/Edit', pageManifest['profile/Edit'])
  }
} as const
