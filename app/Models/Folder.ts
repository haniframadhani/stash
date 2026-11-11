import { defineModel } from '@guren/core'
import { folders } from '../../db/schema.js'

export type FolderRecord = typeof folders.$inferSelect

export class Folder extends defineModel(folders, {
  base: undefined,
  fillable: ['name', 'parentId'],
}) {}