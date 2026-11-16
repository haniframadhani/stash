/** Body contract of `images.update` (ROUTES_SPEC §4). Rename only for now —
 *  `folderId` and `starred` arrive with the Move (2.4) and Star (4.1) tasks,
 *  so the schema carries `name` and nothing else. Names follow the same rules
 *  as folders: 1–255 chars, no path separators; the sibling-clash rule is
 *  business logic in app/Services/Images.ts.
 */
import { z } from 'zod'

const noSeparators = (value: string) => !value.includes('/') && !value.includes('\\')

const imageName = z
  .string()
  .trim()
  .min(1, 'Image name is required.')
  .max(255)
  .refine(noSeparators, 'Image names cannot contain / or \\.')

export const ImageUpdateSchema = z.object({
  name: imageName.optional(),
})

/** `:id` path segment of `images.update`: digits only, so any other segment is
 *  an unknown image (404), not a validation error (422). */
export const ImageIdParams = z.object({
  id: z.string().regex(/^\d+$/),
})
