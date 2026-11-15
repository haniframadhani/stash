/** The drive's folder payload (ROUTES_SPEC §3 `FolderItem`). Folders have no
 *  star in v1 and no URLs of their own; the client links to `/files/:id`.
 */
import { Resource } from '@guren/core'
import type { FolderRecord } from '../../Models/Folder.js'

export type FolderItemData = {
  id: number
  parentId: number | null
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export class FolderItem extends Resource<FolderRecord, FolderItemData> {
  toArray(): FolderItemData {
    const { id, parentId, name, createdAt, updatedAt, deletedAt } = this.resource
    return {
      id,
      parentId,
      name,
      // The columns store ISO text; timestamps cross the wire as epoch ms.
      createdAt: Date.parse(createdAt),
      updatedAt: Date.parse(updatedAt),
      deletedAt,
    }
  }
}
