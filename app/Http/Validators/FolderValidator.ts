/** Body contracts of `folders.store` and `folders.update` (ROUTES_SPEC §4).
 *  Names are 1–255 chars with no path separators — the sibling-clash and cycle
 *  rules are business logic and live in app/Services/Folders.ts. `parentId` is
 *  an optional id in `store` and, in `update`, additionally accepts explicit
 *  `null` ("move to root"). Multipart/form fields arrive as strings, hence the
 *  coercions; `null` passes through untouched so a move to root stays possible.
 */
import { z } from 'zod'

/** '' and null mean "not sent" (optionalField), an explicit null stays null
 *  (the update contract's "move to root"). */
const optionalFolderId = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().positive().nullable().optional(),
)

const noSeparators = (value: string) => !value.includes('/') && !value.includes('\\')

const folderName = z
  .string()
  .trim()
  .min(1, 'Folder name is required.')
  .max(255)
  .refine(noSeparators, 'Folder names cannot contain / or \\.')

/** `:id` path segment of `folders.update`: digits only, so any other segment is
 *  an unknown folder (404), not a validation error (422). */
export const FolderIdParams = z.object({
  id: z.string().regex(/^\d+$/),
})

export const FolderStoreSchema = z.object({
  name: folderName,
  parentId: optionalFolderId,
})

export const FolderUpdateSchema = z.object({
  name: folderName.optional(),
  parentId: optionalFolderId,
})

export type FolderStoreInput = z.infer<typeof FolderStoreSchema>
export type FolderUpdateInput = z.infer<typeof FolderUpdateSchema>
