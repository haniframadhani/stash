/** Bulk item mutations (ROUTES_SPEC §4). Task 2.4 ships `items.move`; Star,
 *  Trash, Restore and Delete join it with 4.1 and 4.2. The action validates the
 *  batch, delegates the atomic write to app/Services/Move.ts, flashes the
 *  count, and redirects back to where the first moved item came from.
 */
import { Controller, getSessionFromContext } from '@guren/core'
import type { UserRecord } from '../../Models/User.js'
import { moveItems } from '../../Services/Move.js'

export default class ItemController extends Controller {
  async move(): Promise<Response> {
    // Defense in depth: the route already sits behind the auth middleware.
    await this.auth.userOrFail<UserRecord>()
    const { body } = this.validated('items.move')

    const result = await moveItems(body)
    const moved = result.imageCount + result.folderCount
    if (moved > 0) {
      getSessionFromContext(this.ctx)?.flash('flash', {
        success: `Moved ${moved} ${moved === 1 ? 'item' : 'items'}`,
      })
    }
    return this.redirect(redirectTargetFor(result.fromFolderId))
  }
}

/** Back to where the moved items were visible: their source folder, or root. */
function redirectTargetFor(folderId: number | null): string {
  return folderId === null ? '/files' : `/files/${folderId}`
}
