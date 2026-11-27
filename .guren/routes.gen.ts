// Generated from routes/web.ts — DO NOT EDIT
// Run `guren codegen` to regenerate.

export const routeManifest = {
  'drive.folder': { method: 'GET', path: '/files/:folderId' },
  'drive.index': { method: 'GET', path: '/files' },
  'drive.recent': { method: 'GET', path: '/recent' },
  'drive.starred': { method: 'GET', path: '/starred' },
  'drive.trash': { method: 'GET', path: '/trash' },
  'folders.store': { method: 'POST', path: '/folders' },
  'folders.update': { method: 'PATCH', path: '/folders/:id' },
  'home': { method: 'GET', path: '/' },
  'images.replace': { method: 'POST', path: '/images/:id/versions' },
  'images.restoreVersion': { method: 'POST', path: '/images/:id/versions/:version/restore' },
  'images.update': { method: 'PATCH', path: '/images/:id' },
  'items.delete': { method: 'POST', path: '/items/delete' },
  'items.move': { method: 'POST', path: '/items/move' },
  'items.restore': { method: 'POST', path: '/items/restore' },
  'items.trash': { method: 'POST', path: '/items/trash' },
  'login': { method: 'GET', path: '/login' },
  'login.store': { method: 'POST', path: '/login' },
  'logout': { method: 'POST', path: '/logout' },
  'preview.show': { method: 'GET', path: '/preview/:publicId/:file' },
  'profile.edit': { method: 'GET', path: '/profile' },
  'profile.update': { method: 'PUT', path: '/profile' },
  'trash.empty': { method: 'DELETE', path: '/trash' },
  'uploads.store': { method: 'POST', path: '/uploads' },
} as const

export type RouteManifest = typeof routeManifest
export type RouteName = keyof RouteManifest
export type RouteMethod = [RouteName] extends [never] ? string : RouteManifest[RouteName]['method']
export type RoutePath = [RouteName] extends [never] ? string : RouteManifest[RouteName]['path']

type PrimitiveQueryValue = string | number | boolean | null | undefined
type QueryValue = PrimitiveQueryValue | readonly PrimitiveQueryValue[]
export type RouteQuery = Record<string, QueryValue>

type SegmentParamKey<TSegment extends string> = TSegment extends `:${infer TParam}`
  ? TParam extends `${infer TName}{${string}`
    ? TName
    : TParam extends `${infer TName}?`
      ? TName
      : TParam
  : never
type PathParamKeys<TPath extends string> = TPath extends `${infer THead}/${infer TRest}`
  ? SegmentParamKey<THead> | PathParamKeys<TRest>
  : SegmentParamKey<TPath>
type HasPathParams<TPath extends string> = [PathParamKeys<TPath>] extends [never] ? false : true
type PathParamsOf<TPath extends string> =
  HasPathParams<TPath> extends false
    ? Record<string, never>
    : { [TKey in PathParamKeys<TPath>]: string | number }

export type RouteParams<TName extends RouteName> = PathParamsOf<RouteManifest[TName]['path']>

type RouteArgs<TName extends RouteName> =
  HasPathParams<RouteManifest[TName]['path']> extends false
    ? [query?: RouteQuery]
    : [params: RouteParams<TName>, query?: RouteQuery]

export function route<TName extends RouteName>(name: TName, ...args: RouteArgs<TName>): string {
  const definition: { method: RouteMethod; path: RoutePath } | undefined = routeManifest[name]
  if (!definition) {
    throw new Error(`Route [${String(name)}] not defined.`)
  }

  const [firstArg, secondArg] = args as [RouteQuery | RouteParams<TName> | undefined, RouteQuery | undefined]
  const params = (args.length > 1 ? firstArg : hasPathParams(definition.path) ? firstArg : undefined) as RouteParams<TName> | undefined
  const query = (args.length > 1 ? secondArg : hasPathParams(definition.path) ? undefined : firstArg) as RouteQuery | undefined
  const path = substituteParams(definition.path, params as Record<string, string | number> | undefined)
  return appendQueryString(path, query)
}

export const routes = {
  drive: {
    folder: (params: RouteParams<'drive.folder'>, query?: RouteQuery) => route('drive.folder', params, query),
    index: (query?: RouteQuery) => route('drive.index', query),
    recent: (query?: RouteQuery) => route('drive.recent', query),
    starred: (query?: RouteQuery) => route('drive.starred', query),
    trash: (query?: RouteQuery) => route('drive.trash', query)
  },
  folders: {
    store: (query?: RouteQuery) => route('folders.store', query),
    update: (params: RouteParams<'folders.update'>, query?: RouteQuery) => route('folders.update', params, query)
  },
  home: (query?: RouteQuery) => route('home', query),
  images: {
    replace: (params: RouteParams<'images.replace'>, query?: RouteQuery) => route('images.replace', params, query),
    restoreVersion: (params: RouteParams<'images.restoreVersion'>, query?: RouteQuery) => route('images.restoreVersion', params, query),
    update: (params: RouteParams<'images.update'>, query?: RouteQuery) => route('images.update', params, query)
  },
  items: {
    delete: (query?: RouteQuery) => route('items.delete', query),
    move: (query?: RouteQuery) => route('items.move', query),
    restore: (query?: RouteQuery) => route('items.restore', query),
    trash: (query?: RouteQuery) => route('items.trash', query)
  },
  login: Object.assign(
    (query?: RouteQuery) => route('login', query),
    {
    store: (query?: RouteQuery) => route('login.store', query)
  }
  ),
  logout: (query?: RouteQuery) => route('logout', query),
  preview: {
    show: (params: RouteParams<'preview.show'>, query?: RouteQuery) => route('preview.show', params, query)
  },
  profile: {
    edit: (query?: RouteQuery) => route('profile.edit', query),
    update: (query?: RouteQuery) => route('profile.update', query)
  },
  trash: {
    empty: (query?: RouteQuery) => route('trash.empty', query)
  },
  uploads: {
    store: (query?: RouteQuery) => route('uploads.store', query)
  }
} as const

function hasPathParams(path: string): boolean {
  return /(?:^|\/):[A-Za-z0-9_-]/u.test(path)
}

function substituteParams(path: string, params?: Record<string, string | number>): string {
  if (!params) {
    return path
  }

  return path.replace(/(^|\/):([A-Za-z0-9_-]+\*?)(?:\{[^{}]*\{[^{}]*\}[^{}]*\}|\{[^{}]*\})?\??/gu, (match, prefix, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      return match
    }

    return `${prefix}${encodeURIComponent(String(params[key]))}`
  })
}

function appendQueryString(path: string, query?: RouteQuery): string {
  if (!query) {
    return path
  }

  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          search.append(key, String(item))
        }
      }
      continue
    }

    search.set(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `${path}?${serialized}` : path
}

declare module '@guren/core' {
  interface GurenRouteContracts {
    routes: {
      'folders.store': { body: { name: string; parentId?: number | null } }
      'folders.update': { params: { id: string }; body: { name?: string; parentId?: number | null } }
      'images.replace': { params: { id: string }; body: { format?: "webp" | "avif" | "original"; quality?: number; maxDimension?: number } }
      'images.restoreVersion': { params: { id: string; version: string } }
      'images.update': { params: { id: string }; body: { name?: string } }
      'items.delete': { body: { imageIds: number[]; folderIds: number[] } }
      'items.move': { body: { imageIds: number[]; folderIds: number[]; targetFolderId: number | null } }
      'items.restore': { body: { imageIds: number[]; folderIds: number[] } }
      'items.trash': { body: { imageIds: number[]; folderIds: number[] } }
      'login.store': { body: { email: string; password: string; remember: boolean } }
      'profile.update': { body: { name: string; email: string; password: string; currentPassword: string } }
      'uploads.store': { body: { format?: "webp" | "avif" | "original"; quality?: number; maxDimension?: number; folderId?: number; name?: string } }
    }
  }
}
