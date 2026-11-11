import { defineModel } from '@guren/core'
import { images } from '../../db/schema.js'

export type ImageRecord = typeof images.$inferSelect

export class Image extends defineModel(images, {
  base: undefined,
  fillable: ['name', 'slug', 'folderId', 'starred', 'currentVersion'],
}) {}