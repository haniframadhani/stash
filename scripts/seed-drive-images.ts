/** Dev seed for the grid/list polish manual check (TASKS 1.5): converts N
 *  images through the real pipeline (ImageConverter + ImageStore) and writes
 *  the DB rows, so the drive has real thumbnails, varied sizes and names.
 *
 *  Run with the app configured and the storage stack up (docker compose ps):
 *    bun scripts/seed-drive-images.ts [count]   (default 50)
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

const count = Number.parseInt(process.argv[2] ?? '50', 10)
if (!Number.isInteger(count) || count < 1 || count > 500) {
  console.error('Usage: bun scripts/seed-drive-images.ts [count 1-500]')
  process.exit(1)
}

await app.boot()

const env = app.container.make<AppEnv>('env')
const urls = UrlBuilder.fromEnv(env)
const store = ImageStore.fromContainer()
// Suffix so reruns never trip the case-insensitive sibling-name unique index.
const stamp = Date.now().toString(36)

for (let index = 1; index <= count; index++) {
  // Varied dimensions and content, so name/modified/size sorting has a spread
  // and the grid shows real, different thumbnails.
  const width = 320 + ((index * 137) % 700)
  const height = 240 + ((index * 89) % 500)
  const hue = (index * 37) % 360
  const original = await sharp({
    create: { width, height, channels: 3, background: { r: hue, g: 255 - hue, b: (hue * 2) % 255 } },
  })
    .png()
    .toBuffer()

  const converted = await convert(original, { format: 'webp' })
  const name = `Demo image ${String(index).padStart(2, '0')} · ${stamp}`
  const publicId = newPublicId()
  const keys = await store.putVersion({
    publicId,
    version: 1,
    ext: converted.ext,
    mime: converted.mime,
    image: converted.image,
    thumb: converted.thumb,
  })

  const image = await Image.create({ name, slug: toSlug(name), currentVersion: 1 }, { set: { publicId } })
  await ImageVersion.create(
    {
      format: converted.format,
      mime: converted.mime,
      ext: converted.ext,
      size: converted.size,
      width: converted.width,
      height: converted.height,
      sha256: createHash('sha256').update(converted.image).digest('hex'),
      storageKey: keys.storageKey,
      thumbKey: keys.thumbKey,
      originalName: `${toSlug(name)}.png`,
      originalFormat: 'png',
      originalSize: converted.originalSize,
      convertOptions: JSON.stringify({ format: 'webp', quality: null, maxDimension: null }),
    },
    { set: { imageId: image.id, version: 1 } },
  )
  console.log(`stored ${name}: ${converted.originalSize} B → ${converted.storedSize} B  ${urls.thumb(publicId, toSlug(name), 1)}`)
}

console.log(`Done: ${count} images.`)
