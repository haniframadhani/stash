import { afterEach, expect, test } from 'bun:test'
import env from '../config/env.js'
import { imageSettings } from '../config/images.js'

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
})

test('a missing production variable fails boot and names it', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.APP_KEY
  expect(() => env.parse()).toThrow(/APP_KEY/)
})

test('an invalid value fails boot and names its variable', () => {
  expect(() => env.parse({ PORT: 'not-a-port' })).toThrow(/PORT/)
  expect(() => env.parse({ STORAGE_DISK: 'ftp' })).toThrow(/STORAGE_DISK/)
})

test('an out-of-range number fails boot', () => {
  expect(() => env.parse({ CONVERT_CONCURRENCY: '0' })).toThrow(/CONVERT_CONCURRENCY/)
  expect(() => env.parse({ DEFAULT_QUALITY_WEBP: '101' })).toThrow(/DEFAULT_QUALITY_WEBP/)
})

test('image settings come from the validated env', () => {
  const settings = imageSettings(env.parse({
    MAX_UPLOAD_MB: '2',
    KEEP_VERSIONS: '3',
    DEFAULT_FORMAT: 'avif',
    CONVERT_CONCURRENCY: '4',
  }).values)

  expect(settings.maxUploadBytes).toBe(2 * 1024 * 1024)
  expect(settings.keepVersions).toBe(3)
  expect(settings.defaultFormat).toBe('avif')
  expect(settings.convertConcurrency).toBe(4)
  expect(settings.thumbWidth).toBe(320)
  expect(settings.acceptedInputFormats).toEqual(['jpeg', 'png', 'webp', 'avif', 'gif'])
})
