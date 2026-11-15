/** Dev seed for the public image routes (TASKS 1.3 manual check): converts one
 *  image through the pipeline, stores it via ImageStore, writes the DB rows,
 *  and prints the URLs to open. No auth, no upload endpoint involved.
 *
 *  Run with the app configured (`bun run db:migrate` first):
 *    bun scripts/seed-demo-image.ts
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import app from '../src/app.js'
import { convert } from '../app/Services/ImageConverter.js'
import { Image } from '../app/Models/Image.js'
import { ImageVersion } from '../app/Models/ImageVersion.js'
import { ImageStore, newPublicId } from '../app/Services/ImageStore.js'
import { UrlBuilder } from '../app/Services/UrlBuilder.js'
import { toSlug } from '../app/Services/Slug.js'
import type { AppEnv } from '@guren/core'

await app.boot()

// A 900x600 red-orange gradient with EXIF orientation, like a phone photo.
const original = await sharp({
  create: { width: 900, height: 600, channels: 3, background: '#e2574c' },
})
  .png()
  .toBuffer()

const converted = await convert(original, { format: 'webp' })

const name = 'Stash demo'
const slug = toSlug(name)
const publicId = newPublicId()
const keys = await ImageStore.fromContainer().putVersion({
  publicId,
  version: 1,
  ext: converted.ext,
  mime: converted.mime,
  image: converted.image,
  thumb: converted.thumb,
})

// publicId is server-chosen (never request input), so it stays out of fillable.
const image = await Image.create({ name, slug, currentVersion: 1 }, { set: { publicId } })
await ImageVersion.create({
  format: converted.format,
  mime: converted.mime,
  ext: converted.ext,
  size: converted.size,
  width: converted.width,
  height: converted.height,
  sha256: createHash('sha256').update(converted.image).digest('hex'),
  storageKey: keys.storageKey,
  thumbKey: keys.thumbKey,
  originalName: 'demo.png',
  originalFormat: 'png',
  originalSize: original.length,
  convertOptions: JSON.stringify({ format: 'webp', quality: null, maxDimension: null }),
}, { set: { imageId: image.id, version: 1 } })

const env = app.container.make<AppEnv>('env')
const urls = new UrlBuilder(env.PUBLIC_BASE_URL ?? env.APP_URL)
console.log(`Stored image ${image.id} (${converted.originalSize} B → ${converted.storedSize} B):`)
console.log(`  permanent: ${urls.permanent({ publicId, slug, version: 1, ext: converted.ext })}`)
console.log(`  latest:    ${urls.latest(publicId)}`)
console.log(`  thumb:     ${urls.thumb(publicId, slug, 1)}`)
