/** Display name → URL slug (docs/IMAGE_PIPELINE.md §4).
 *  NFKD-normalize, drop diacritics, lowercase, non [a-z0-9] → `-`,
 *  collapse repeats, trim `-`, max 60 chars, fallback `image`.
 *  The slug is cosmetic in URLs and never used for lookup.
 */
const MAX_SLUG_LENGTH = 60
const FALLBACK = 'image'

export function toSlug(name: string): string {
  const withoutDiacritics = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const slugged = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  return slugged.length > 0 ? slugged : FALLBACK
}
