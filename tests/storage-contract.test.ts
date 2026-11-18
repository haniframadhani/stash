import { beforeAll, describe, it, afterEach, expect } from 'bun:test'
import { randomBytes } from 'node:crypto'

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
})

/**
 * Create a storage driver instance directly.
 */
async function createDriver(driverName: string, overrides: Record<string, string>) {
  let driver

  switch (driverName) {
    case 'memory': {
      driver = new (await import('@guren/server')).MemoryStorageDriver({
        url: undefined,
      } as any)
      break
    }
    case 'local': {
      driver = new (await import('@guren/server')).LocalStorageDriver({
        root: './storage/app',
        visibility: 'private',
      } as any)
      break
    }
    case 's3': {
      driver = new (await import('@guren/server')).S3Driver({
        bucket: overrides.S3_BUCKET ?? 'stash-test-bucket',
        region: overrides.S3_REGION ?? 'us-east-1',
        endpoint: overrides.S3_ENDPOINT ?? 'http://localhost:8333',
        accessKeyId: overrides.S3_ACCESS_KEY_ID ?? 'admin',
        secretAccessKey: overrides.S3_SECRET_ACCESS_KEY ?? 'secret',
        acl: false,
        visibility: 'private',
      } as any)
      break
    }
    default:
      throw new Error(`Unknown driver: ${driverName}`)
  }

  return driver
}

/**
 * Run the storage contract for a given driver.
 */
async function runStorageContract(
  driver: import('@guren/server').StorageDriver,
  label: string,
  _overrides: Record<string, string>,
) {
  // --- put ---
  const testKey = `contract-test/${Date.now()}-${randomBytes(4).toString('hex')}`
  const content = randomBytes(1024)
  const putResult = await driver.put(testKey, content, {
    contentType: 'image/jpeg',
  })
  expect(typeof putResult).toBe('string')

  // --- exists ---
  const existsBefore = await driver.exists(testKey)
  expect(existsBefore).toBe(true)

  // --- get ---
  const retrieved = await driver.get(testKey)
  expect(retrieved).not.toBeNull()
  expect(retrieved?.length).toBeGreaterThan(0)

  // --- metadata ---
  const meta = await driver.metadata(testKey)
  expect(meta).not.toBeNull()
  // contentType may be undefined for some drivers; just verify metadata exists
  if (meta?.contentType !== undefined) {
    expect(meta?.contentType).toBe('image/jpeg')
  }

  // --- delete ---
  const deleted = await driver.delete(testKey)
  expect(deleted).toBe(true)

  // --- exists after delete ---
  const existsAfter = await driver.exists(testKey)
  expect(existsAfter).toBe(false)

  // --- deleteMany ---
  const multiKeys: string[] = []
  for (let i = 0; i < 3; i++) {
    const k = `contract-test-multi/${Date.now()}-${i}`
    multiKeys.push(k)
    await driver.put(k, randomBytes(512))
  }
  const deletedCount = await driver.deleteMany(multiKeys)
  expect(deletedCount).toBe(3)

  // Verify all deleted
  for (const k of multiKeys) {
    expect(await driver.exists(k)).toBe(false)
  }

  console.log(`[storage-contract] ${label}: OK`)
}

// =============================================================================
// Tests
// =============================================================================

describe('Storage contract: memory driver (always)', () => {
  beforeAll(() => {
    process.env.STORAGE_DISK = 'memory'
    if (!process.env.APP_KEY) {
      process.env.APP_KEY = `base64:${randomBytes(32).toString('base64')}`
    }
  })

  it('round-triputils put/get/exists/delete/deleteMany/metadata', async () => {
    const driver = await createDriver('memory', {})
    await runStorageContract(driver, 'memory disk', {})
  })
})

describe('Storage contract: local driver (always)', () => {
  beforeAll(() => {
    process.env.STORAGE_DISK = 'local'
    if (!process.env.APP_KEY) {
      process.env.APP_KEY = `base64:${randomBytes(32).toString('base64')}`
    }
  })

  it('round-triputils put/get/exists/delete/deleteMany/metadata', async () => {
    const driver = await createDriver('local', {})
    await runStorageContract(driver, 'local disk', {})
  })
})

/**
 * S3 storage contract test.
 * Runs the full contract (put, get, exists, delete, deleteMany, metadata)
 * against an S3-compatible storage backend.
 * 
 * Requires RUN_S3_TESTS=1 to be set; otherwise the describe is skipped.
 */
const s3TestsEnabled = process.env.RUN_S3_TESTS === '1'

if (s3TestsEnabled) {
  describe('Storage contract: S3 driver', () => {
    beforeAll(() => {
      process.env.STORAGE_DISK = 's3'
      if (!process.env.S3_BUCKET) {
        process.env.S3_BUCKET = 'stash-test-bucket'
      }
      if (!process.env.S3_ENDPOINT) {
        process.env.S3_ENDPOINT = 'http://localhost:8333'
      }
      if (!process.env.S3_ACCESS_KEY_ID) {
        process.env.S3_ACCESS_KEY_ID = 'admin'
      }
      if (!process.env.S3_SECRET_ACCESS_KEY) {
        process.env.S3_SECRET_ACCESS_KEY = 'secret'
      }
      if (!process.env.S3_REGION) {
        process.env.S3_REGION = 'us-east-1'
      }
    })

    // R2 round trips are slower than a local disk: the whole contract takes ~5s
    // from a warm connection, so bun's 5s default is too tight.
    it('round-triputils put/get/exists/delete/deleteMany/metadata against S3', async () => {
      const driver = await createDriver('s3', {
        S3_BUCKET: process.env.S3_BUCKET!,
        S3_ENDPOINT: process.env.S3_ENDPOINT!,
        S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
        S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
        S3_REGION: process.env.S3_REGION!,
      })
      await runStorageContract(driver, 'S3 disk', {
        S3_BUCKET: process.env.S3_BUCKET!,
        S3_ENDPOINT: process.env.S3_ENDPOINT!,
        S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
        S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
        S3_REGION: process.env.S3_REGION!,
      })
    }, 30_000)
  })
} else {
  // Conditionally skip the S3 describe by providing no it callbacks
  // This is a bun:test pattern: an empty describe with beforeAll is effectively skipped
  describe('Storage contract: S3 driver (skipped: set RUN_S3_TESTS=1 to run)', () => {
    beforeAll(() => {
      // Intentionally left empty - tests are skipped
    })
    // No it() declarations - the describe is effectively skipped
  })
}