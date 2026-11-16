/** Body contract of `items.move` (ROUTES_SPEC §4). `targetFolderId` is
 *  required: `null` is the root, a positive id a folder. The business rules
 *  (cycles, name clashes, unknown items) live in app/Services/Move.ts; here we
 *  only cap the batch and make sure it names something. Arrays may arrive as
 *  JSON or as string fields through a form, hence the per-item coercion.
 */
import { z } from 'zod'

const itemIds = z.array(z.coerce.number().int().positive()).default([])

export const ItemMoveSchema = z
  .object({
    imageIds: itemIds,
    folderIds: itemIds,
    targetFolderId: z.preprocess(
      (value) => (value === '' ? null : value),
      z.coerce.number().int().positive().nullable(),
    ),
  })
  .superRefine((body, ctx) => {
    const total = body.imageIds.length + body.folderIds.length
    if (total === 0) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Select at least one item to move.' })
    }
    if (total > 500) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Move at most 500 items at a time.' })
    }
  })
