/** Body contract of `uploads.store` (ROUTES_SPEC §4). The image itself arrives
 *  as the multipart `file` field and is validated by sniffing its bytes, never
 *  by the client MIME — so the schema covers the options only. Multipart fields
 *  are strings, hence the coercions. The UI omits empty fields, but a plain
 *  form could send empty strings; those read as "not set".
 */
import { z } from 'zod'

const optionalField = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional())

export const UploadOptionsSchema = z.object({
  format: optionalField(z.enum(['webp', 'avif', 'original'])),
  quality: optionalField(z.coerce.number().int().min(1).max(100)),
  maxDimension: optionalField(z.coerce.number().int().min(1)),
  folderId: optionalField(z.coerce.number().int().positive()),
  name: optionalField(z.string().min(1).max(255)),
})

/** `images.replace` (ROUTES_SPEC §4): the same convert options as an upload,
 *  without a destination folder or a new name — a replace keeps both. */
export const ReplaceOptionsSchema = UploadOptionsSchema.omit({ folderId: true, name: true })

export type UploadOptionsInput = z.infer<typeof UploadOptionsSchema>
