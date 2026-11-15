// Generated from routes/web.ts — DO NOT EDIT
// Run `guren codegen` to regenerate.

export const routeManifest = {
  'drive.index': { method: 'GET', path: '/files' },
  'drive.recent': { method: 'GET', path: '/recent' },
  'drive.starred': { method: 'GET', path: '/starred' },
  'drive.trash': { method: 'GET', path: '/trash' },
  'home': { method: 'GET', path: '/' },
  'image.latest': { method: 'GET', path: '/i/:publicId' },
  'image.show': { method: 'GET', path: '/i/:publicId/:file' },
  'image.thumb': { method: 'GET', path: '/t/:publicId/:file' },
  'login': { method: 'GET', path: '/login' },
  'login.store': { method: 'POST', path: '/login' },
  'logout': { method: 'POST', path: '/logout' },
  'profile.edit': { method: 'GET', path: '/profile' },
  'profile.update': { method: 'PUT', path: '/profile' },
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
    index: (query?: RouteQuery) => route('drive.index', query),
    recent: (query?: RouteQuery) => route('drive.recent', query),
    starred: (query?: RouteQuery) => route('drive.starred', query),
    trash: (query?: RouteQuery) => route('drive.trash', query)
  },
  home: (query?: RouteQuery) => route('home', query),
  image: {
    latest: (params: RouteParams<'image.latest'>, query?: RouteQuery) => route('image.latest', params, query),
    show: (params: RouteParams<'image.show'>, query?: RouteQuery) => route('image.show', params, query),
    thumb: (params: RouteParams<'image.thumb'>, query?: RouteQuery) => route('image.thumb', params, query)
  },
  login: Object.assign(
    (query?: RouteQuery) => route('login', query),
    {
    store: (query?: RouteQuery) => route('login.store', query)
  }
  ),
  logout: (query?: RouteQuery) => route('logout', query),
  profile: {
    edit: (query?: RouteQuery) => route('profile.edit', query),
    update: (query?: RouteQuery) => route('profile.update', query)
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
      'login.store': { body: { email: string; password: string; remember: boolean } }
      'profile.update': { body: { name: string; email: string; password: string; currentPassword: string } }
      'uploads.store': { body: { format?: "webp" | "avif" | "original"; quality?: number; maxDimension?: number; folderId?: number; name?: string } }
    }
  }
}
