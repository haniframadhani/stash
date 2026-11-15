/** "Remember these settings" (UI_SPEC §3): the last confirmed choice lives in
 *  localStorage and becomes the dialog's defaults next time. The parse is
 *  separate from the storage access so it is unit-testable and nothing odd in
 *  storage can reach the dialog. */
import type { StashCapabilities } from '../types.js'

export interface UploadSettings {
  format: 'webp' | 'avif' | 'original'
  quality?: number
  maxDimension?: number
}

export const SETTINGS_KEY = 'stash.uploadSettings'

export function defaultQuality(caps: StashCapabilities, format: 'webp' | 'avif' | 'original'): number {
  return format === 'avif' ? caps.defaults.qualityAvif : caps.defaults.qualityWebp
}

export function parseUploadSettings(raw: unknown, caps: { avif: boolean }): UploadSettings | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.format !== 'webp' && value.format !== 'avif' && value.format !== 'original') return null
  if (value.format === 'avif' && !caps.avif) return null
  const settings: UploadSettings = { format: value.format }
  if (value.quality !== undefined) {
    if (typeof value.quality !== 'number' || !Number.isInteger(value.quality) || value.quality < 1 || value.quality > 100) return null
    settings.quality = value.quality
  }
  if (value.maxDimension !== undefined) {
    if (typeof value.maxDimension !== 'number' || !Number.isInteger(value.maxDimension) || value.maxDimension < 1) return null
    settings.maxDimension = value.maxDimension
  }
  return settings
}

export function loadUploadSettings(caps: { avif: boolean }): UploadSettings | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null
  try {
    return parseUploadSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'), caps)
  } catch {
    return null
  }
}

export function saveUploadSettings(settings: UploadSettings): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
