/** The sidebar storage meter's numbers (ROUTES_SPEC §3 `storage` prop).
 *  Milestone 4.5 turns this into its own screen; the shared prop reads it now.
 */
import { isNull, sql } from 'drizzle-orm'
import type { SqliteSeederContext } from '@guren/core'
import { getDatabase } from '../../config/database.js'
import { imageVersions, images } from '../../db/schema.js'

export interface StorageUsage {
  usedBytes: number
  imageCount: number
}

export async function storageUsage(): Promise<StorageUsage> {
  // Same handle shape the seeder context documents.
  const db = (await getDatabase()) as SqliteSeederContext['db']

  const [used] = await db
    .select({ usedBytes: sql<number>`coalesce(sum(${imageVersions.size}), 0)` })
    .from(imageVersions)
  const [counted] = await db
    .select({ imageCount: sql<number>`count(*)` })
    .from(images)
    .where(isNull(images.deletedAt))

  return {
    usedBytes: Number(used?.usedBytes ?? 0),
    imageCount: Number(counted?.imageCount ?? 0),
  }
}
