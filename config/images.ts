import { defineConfig, type AppEnv } from '@guren/core'

/** Inputs the converter sniffs and accepts (docs/IMAGE_PIPELINE.md §1). */
export const INPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif'] as const
export type InputFormat = (typeof INPUT_FORMATS)[number]
export type OutputFormat = 'webp' | 'avif' | 'original'

/** Typed image pipeline settings; values come from the validated env, caps and thumb size are fixed. */
export interface ImageSettings {
  readonly acceptedInputFormats: readonly InputFormat[]
  readonly outputFormats: readonly OutputFormat[]
  readonly defaultFormat: OutputFormat
  readonly defaultQualityWebp: number
  readonly defaultQualityAvif: number
  readonly avifEffort: number
  readonly maxUploadBytes: number
  readonly maxPixels: number
  readonly convertConcurrency: number
  readonly keepVersions: number
  readonly thumbWidth: number
  readonly thumbQuality: number
}

export function imageSettings(env: AppEnv): ImageSettings {
  return {
    acceptedInputFormats: INPUT_FORMATS,
    outputFormats: ['webp', 'avif', 'original'],
    defaultFormat: env.DEFAULT_FORMAT,
    defaultQualityWebp: env.DEFAULT_QUALITY_WEBP,
    defaultQualityAvif: env.DEFAULT_QUALITY_AVIF,
    avifEffort: env.AVIF_EFFORT,
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    maxPixels: env.MAX_PIXELS,
    convertConcurrency: env.CONVERT_CONCURRENCY,
    keepVersions: env.KEEP_VERSIONS,
    thumbWidth: 320,
    thumbQuality: 70,
  }
}

declare module '@guren/server' {
  interface ConfigDefinitions {
    images: ImageSettings
  }
  interface ServiceBindings {
    images: ImageSettings
  }
}

export default defineConfig({
  key: 'images',
  resolve: imageSettings,
  bind: (container, config) => {
    container.instance('images', config)
  },
})
