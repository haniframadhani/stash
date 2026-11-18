/** The route-guard sweep (ROUTES_SPEC §6): every registered route that is not
 *  GET/HEAD must refuse an unauthenticated request, and the public allowlist in
 *  §1 must be *exactly* the set of routes reachable without login.
 *
 *  The route list comes from the framework's own route graph
 *  (`app.router.definitions()`), so a new route joins the sweep automatically
 *  and one registered without `requireAuthenticated` fails here rather than in
 *  production. Only the params need hand-written values: a pattern is not a URL.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../src/app.js'
import { resetDatabase } from '../config/database.js'

/** ROUTES_SPEC §1 public routes an unauthenticated **GET** may reach, labelled
 *  as this app's graph does (the spec table's `login.show` is registered as
 *  `login`, and `/health` has no name). The set is asserted both ways - a public
 *  route that disappears fails the guard, and so does a private one that quietly
 *  becomes reachable. Images are served by the bucket domain, so there is no
 *  public image route left; `login.store` is a POST (see PUBLIC_MUTATIONS). */
const PUBLIC_ROUTES = ['login', 'GET /health'] as const

/** Concrete values for the params in the graph. A value that matches no row is
 *  fine: the guard must refuse before any lookup, and a 404 is a legitimate
 *  answer on a public route. */
const PARAM_VALUES: Record<string, string> = {
  publicId: 'Ab3xY9kQ2mZ1',
  file: 'anything.v1.webp',
  id: '999999',
  folderId: '999999',
  version: '1',
}

interface RouteDefinition {
  method: string
  path: string
  name?: string
}

function definitionRoutes(): RouteDefinition[] {
  const router = (app as { router?: { definitions(): RouteDefinition[] } }).router
  if (!router) throw new Error('The app exposes no route graph: the sweep would pass vacuously.')
  return router.definitions()
}

/** A path pattern turned into a request URL: every `:param` gets a value from
 *  PARAM_VALUES, and an unknown name throws instead of quietly requesting a URL
 *  the test did not mean to exercise. */
function materialize(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, param: string) => {
    const value = PARAM_VALUES[param]
    if (!value) throw new Error(`No test value for the ":${param}" param in "${path}"`)
    return value
  })
}

/** The route's name, or its `METHOD path` when it has none (`/health`). */
function label(route: RouteDefinition): string {
  return route.name ?? `${route.method} ${route.path}`
}

/** A guard refusal is a redirect to login (the app's `requireAuthenticated`
 *  choice) or a plain 401/403 - never a 2xx. A public route's own 404 counts as
 *  "not refused": the request reached the handler. A hop like `/` → `/files`
 *  is followed, so the classified response is the one that finally refused. */
async function classify(url: string): Promise<{ status: number, headers: Headers }> {
  let response = await send('GET', url)
  for (let hop = 0; hop < 3 && response.status >= 300 && response.status < 400; hop++) {
    const location = response.headers.get('location')
    // The auth middleware's own redirect is what we are looking for: no follow.
    if (!location || location.startsWith('/login')) break
    response = await send('GET', location)
  }
  return response
}

function isRefused(response: { status: number, headers: Headers }): boolean {
  if (response.status === 401 || response.status === 403) return true
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') ?? ''
    return location.startsWith('/login')
  }
  return false
}

let http: TestApp
/** A **guest** with a primed CSRF token. Without it every mutation answers 403
 *  from the CSRF middleware, so the sweep would pass even with no auth guard at
 *  all; with it, only the route's own guard (or the lack of one) decides. */
let guest: TestApp

beforeAll(async () => {
  http = await TestApp.fromApp(app)
  guest = await http.withCsrf()
})

beforeEach(async () => {
  await resetDatabase()
})

/** The only non-GET route that may answer a request without a session: logging
 *  in. Every other mutation must be refused, so this list may only ever grow
 *  with a §1 edit. `login.store` is skipped by the sweep rather than asserted
 *  to succeed: a bare request carries no CSRF token, so it answers 403 - a
 *  refusal is not evidence the route is private, and only a real login proves
 *  the public path works (tests/controllers cover that). */
const PUBLIC_MUTATIONS = ['login.store'] as const

describe('route guard', () => {
  it('refuses every non-GET/HEAD route without a session', async () => {
    const mutating = definitionRoutes().filter(
      (route) => route.method !== 'GET' && route.method !== 'HEAD' && !PUBLIC_MUTATIONS.includes(route.name as never),
    )
    // A sweep over nothing is a green test that guarantees nothing.
    expect(mutating.length).toBeGreaterThan(5)

    for (const route of mutating) {
      const url = materialize(route.path)
      const response = await guestCall(route.method, url)
      const ok = response.status >= 200 && response.status < 300
      expect(ok, `${label(route)} answered ${response.status} without a session`).toBe(false)
      expect(isRefused(response), `${label(route)} neither answered 2xx nor refused: ${response.status}`).toBe(true)
    }
  })

  it('reaches exactly the public allowlist without a session', async () => {
    const reachable: string[] = []
    for (const route of definitionRoutes()) {
      if (route.method !== 'GET' && route.method !== 'HEAD') continue
      const response = await classify(materialize(route.path))
      if (!isRefused(response)) reachable.push(label(route))
    }

    expect(new Set(reachable)).toEqual(new Set(PUBLIC_ROUTES))
  })
})

/** One request through the app's own fetch, so a method the client has no
 *  helper for still goes through the real middleware chain. */
async function send(method: string, url: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost${url}`, { method }))
}

/** A mutation sent as the CSRF-primed guest, with an empty body. This is what
 *  makes the sweep meaningful: with a token, the CSRF middleware lets the
 *  request through, so a 2xx here means no guard stands between a stranger and
 *  the action. A route without its `requireAuthenticated` middleware still
 *  usually fails on its controller's own `userOrFail()` or on validation - which
 *  is a refusal too, and is why the assertion is "never 2xx" rather than "401". */
async function guestCall(method: string, url: string): Promise<{ status: number, headers: Headers }> {
  switch (method) {
    case 'POST':
      return guest.post(url, {})
    case 'PUT':
      return guest.put(url, {})
    case 'PATCH':
      return guest.patch(url, {})
    case 'DELETE':
      return guest.delete(url)
    default:
      return send(method, url)
  }
}
