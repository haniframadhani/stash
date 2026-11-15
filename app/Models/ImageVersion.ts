import { defineModel } from '@guren/core'
import { imageVersions } from '../../db/schema.js'

export type ImageVersionRecord = typeof imageVersions.$inferSelect

/** One immutable version of an image. `(imageId, version)` is unique and
 *  `(publicId, version)` never changes content (PLANNING.md §6). */
export class ImageVersion extends defineModel(imageVersions, {
  base: undefined,
  fillable: [
    'format',
    'mime',
    'ext',
    'size',
    'width',
    'height',
    'sha256',
    'storageKey',
    'thumbKey',
    'originalName',
    'originalFormat',
    'originalSize',
    'convertOptions',
  ],
}) {}
