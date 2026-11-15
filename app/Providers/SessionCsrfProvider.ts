/** Session + CSRF mounting with the public delivery prefixes excluded.
 *
 *  The framework mounts session and CSRF for every path, and its CSRF
 *  middleware sets the `XSRF-TOKEN` cookie on *every* safe request, while the
 *  session middleware re-issues its cookie whenever a request carries one.
 *  Public image responses must carry no `Set-Cookie` (IMAGE_PIPELINE.md §5),
 *  so `createApp` opts out of `autoSession`/`autoCsrf` and this provider
 *  mounts the same middleware with the `/i/`, `/t/` and `/p/` prefixes skipped.
 */import {
  ServiceProvider,
  createCsrfMiddleware,
  createSessionMiddleware,
  defineMiddleware,
  type Application,
  type SessionManager,
} from '@guren/core'

/** Public delivery routes; cookies never attach to their responses. */
const COOKIELESS_PREFIXES = ['/i/', '/t/', '/p/'] as const

function isCookieless(ctx: Parameters<ReturnType<typeof defineMiddleware>>[0]): boolean {
  const pathname = new URL(ctx.req.url).pathname
  return COOKIELESS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function unlessCookieless(middleware: ReturnType<typeof defineMiddleware>): ReturnType<typeof defineMiddleware> {
  return defineMiddleware(async (ctx, next) => (isCookieless(ctx) ? next() : middleware(ctx, next)))
}

export default class SessionCsrfProvider extends ServiceProvider {
  register(): void {
    const app = this.container.make<Application>('app')

    // The manager `config/session.ts` binds; built like AuthServiceProvider's
    // own session middleware, so cookie options and store resolution match.
    const manager = this.container.makeOptional<SessionManager>('session')
    const session = createSessionMiddleware({
      ...manager?.options,
      ...app.authOptions?.sessionOptions,
      ...(manager ? { store: () => manager.store() } : {}),
    })
    const csrf = createCsrfMiddleware({}, () => app.getCookielessAuthPaths())

    // Session outermost, CSRF directly inside it, as the framework mounts them.
    app.use('*', unlessCookieless(session))
    app.use('*', unlessCookieless(csrf))
    // We own the session middleware now; a future autoSession flip must not
    // attach a second one beside it.
    app.markAutoSessionAttached()
  }

  boot(): void {}
}
