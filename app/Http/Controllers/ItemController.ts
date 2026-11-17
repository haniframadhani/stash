/** Bulk item mutations (ROUTES_SPEC §4). Task 2.4 ships `items.move`; task 4.2
 *  adds `items.trash`, `items.restore`, `items.delete` and `trash.empty`. Each
 *  action validates the batch, delegates the work to a service, flashes the
 *  count and redirects: drive mutations answer back on the page the user is on.
 */
import { Controller, getSessionFromContext } from '@guren/core'
import type { UserRecord } from '../../Models/User.js'
import { moveItems } from '../../Services/Move.js'
import { deleteForever, emptyTrash, restoreItems, trashItems } from '../../Services/Trash.js'

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

  async trash(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { body } = this.validated('items.trash')
    const result = await trashItems(body)
    getSessionFromContext(this.ctx)?.flash('flash', {
      success: `Moved ${result.trashed} ${result.trashed === 1 ? 'item' : 'items'} to trash`,
    })
    return this.redirect('/files')
  }

  async restore(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { body } = this.validated('items.restore')
    const result = await restoreItems(body)
    getSessionFromContext(this.ctx)?.flash('flash', {
      success: `Restored ${result.restored} ${result.restored === 1 ? 'item' : 'items'}`,
    })
    return this.redirect('/trash')
  }

  async delete(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { body } = this.validated('items.delete')
    const result = await deleteForever(body)
    getSessionFromContext(this.ctx)?.flash('flash', {
      success: `Deleted ${result.deleted ?? 0} ${(result.deleted ?? 0) === 1 ? 'item' : 'items'} forever`,
    })
    return this.redirect('/trash')
  }

  async empty(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const result = await emptyTrash()
    getSessionFromContext(this.ctx)?.flash('flash', {
      success: result.deleted && result.deleted > 0
        ? `Emptied the Trash (${result.deleted} ${result.deleted === 1 ? 'item' : 'items'})`
        : 'Trash was already empty',
    })
    return this.redirect('/trash')
  }
}

/** Back to where the moved items were visible: their source folder, or root. */
function redirectTargetFor(folderId: number | null): string {
  return folderId === null ? '/files' : `/files/${folderId}`
}
