// Generated from resources/js/pages — DO NOT EDIT
// Run `guren codegen` to regenerate.

import type { PageContract, PagePropsRecord } from '@guren/inertia-client'
import type { ValidationErrors } from '@guren/core'


export const pageManifest = {
  'auth/Login': './pages/auth/Login.tsx',
  'dashboard/Index': './pages/dashboard/Index.tsx',
  'Home': './pages/Home.tsx',
  'profile/Edit': './pages/profile/Edit.tsx',
} as const

export type PageManifest = typeof pageManifest
export type PageId = keyof PageManifest
export type PagePath<TPage extends PageId = PageId> = PageManifest[TPage]

export const pageIds = Object.keys(pageManifest) as PageId[]

export function isPageId(value: string): value is PageId {
  return Object.prototype.hasOwnProperty.call(pageManifest, value)
}

/**
 * Auto-extracted Props types from page components.
 */
export interface PagePropsMap {
  'auth/Login': {
  email?: string
  errors?: ValidationErrors<'email' | 'password'>
}
  'dashboard/Index': {
  user?: { id: number; name: string; email: string } | null
}
  'Home': {
  message: string
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
  dashboard: {
    Index: defineGeneratedPage<'dashboard/Index', PagePropsMap['dashboard/Index']>('dashboard/Index', pageManifest['dashboard/Index'])
  },
  Home: defineGeneratedPage<'Home', PagePropsMap['Home']>('Home', pageManifest['Home']),
  profile: {
    Edit: defineGeneratedPage<'profile/Edit', PagePropsMap['profile/Edit']>('profile/Edit', pageManifest['profile/Edit'])
  }
} as const
