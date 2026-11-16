/** Folder mutations (ROUTES_SPEC §4): POST /folders creates (auto-suffixing a
 *  sibling clash), PATCH /folders/:id renames or moves (cycle-rejecting). Both
 *  answer a redirect (303 for Inertia form posts) back to the folder the user
 *  was browsing, so the refreshed page lists the new or renamed folder.
 */
import { Controller, HttpException } from '@guren/core'
import { Folder, type FolderRecord } from '../../Models/Folder.js'
import type { UserRecord } from '../../Models/User.js'
import { createFolder, updateFolder } from '../../Services/Folders.js'

export default class FolderController extends Controller {
  async store(): Promise<Response> {
    // Defense in depth: the route already sits behind the auth middleware.
    await this.auth.userOrFail<UserRecord>()
    const { body } = this.validated('folders.store')

    const folder = await createFolder({ name: body.name, parentId: body.parentId ?? null })
    return this.redirect(redirectTargetFor(folder.parentId))
  }

  async update(): Promise<Response> {
    await this.auth.userOrFail<UserRecord>()
    const { params, body } = this.validated('folders.update')

    const folder = await this.activeFolder(Number(params.id))
    const updated = await updateFolder(folder, body)
    return this.redirect(redirectTargetFor(updated.parentId))
  }

  /** `:id` names an active folder; unknown ids 404 via `findOrFail`, trashed
   *  ones are just as unreachable for browsing. */
  private async activeFolder(id: number): Promise<FolderRecord> {
    const folder = await Folder.findOrFail(id)
    if (folder.deletedAt !== null) throw new HttpException(404, 'Folder not found.')
    return folder
  }
}

/** Back to where the folder is visible: its parent's page, or My Files at root. */
function redirectTargetFor(parentId: number | null): string {
  return parentId === null ? '/files' : `/files/${parentId}`
}
