import { defineStorageConfig, type DiskConfig } from '@guren/core'

// Stash keeps image bytes on exactly one selected disk (PLANNING.md §10). The
// bucket stays private: public image URLs are served by the app, never by the
// backend, so no disk here needs a public URL or visibility.
export default defineStorageConfig((env) => {
  const disks: Record<string, DiskConfig> = {
    // Dev without any S3. Kept outside public/: everything there is fetchable
    // by URL with no signature and no authorization check.
    local: {
      driver: 'local',
      root: './storage/app',
      visibility: 'private',
    },
  }

  if (env.S3_BUCKET) {
    disks.s3 = {
      driver: 's3',
      bucket: env.S3_BUCKET,
      region: env.S3_REGION ?? 'us-east-1',
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      // Most S3-compatibles do not implement object ACLs. Without this every
      // put would send x-amz-acl, which some backends reject outright.
      acl: false,
      visibility: 'private',
    }
  }

  if (env.STORAGE_DISK === 's3' && !env.S3_BUCKET) {
    throw new Error('STORAGE_DISK=s3 requires S3_BUCKET to name the bucket.')
  }

  // An unknown name is accepted by the manager and only throws when the disk is
  // first resolved, which can be a queued job or a rarely-hit route.
  if (!Object.hasOwn(disks, env.STORAGE_DISK)) {
    throw new Error(
      `STORAGE_DISK="${env.STORAGE_DISK}" is not a declared disk. Declare it in config/storage.ts or use one of: ${Object.keys(disks).join(', ')}.`,
    )
  }

  return { default: env.STORAGE_DISK, disks }
})
