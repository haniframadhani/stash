import { afterEach, expect, test } from 'bun:test'
import env from '../config/env.js'
import storage from '../config/storage.js'

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
})

const resolve = (overrides: Record<string, string>) => storage.resolve(env.parse(overrides).values)

test('local is the default disk, private and outside public/', () => {
  delete process.env.S3_BUCKET

  const config = resolve({ STORAGE_DISK: 'local' })

  expect(config.default).toBe('local')
  expect(config.disks?.s3).toBeUndefined()
  expect(config.disks?.local).toMatchObject({
    driver: 'local',
    root: './storage/app',
    visibility: 'private',
  })
})

test('the s3 disk points at the configured endpoint without object ACLs', () => {
  const config = resolve({
    STORAGE_DISK: 's3',
    S3_BUCKET: 'bucket',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'admin',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_REGION: 'eu-west-1',
  })

  expect(config.default).toBe('s3')
  expect(config.disks?.s3).toMatchObject({
    driver: 's3',
    bucket: 'bucket',
    region: 'eu-west-1',
    endpoint: 'http://localhost:8333',
    accessKeyId: 'admin',
    secretAccessKey: 'secret',
    acl: false,
    visibility: 'private',
  })
})

test('s3 without a bucket fails the boot and names S3_BUCKET', () => {
  delete process.env.S3_BUCKET

  expect(() => resolve({ STORAGE_DISK: 's3' })).toThrow(/S3_BUCKET/)
})
