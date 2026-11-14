/** One file per XHR (UI_SPEC §Upload queue): XMLHttpRequest because the queue
 *  in task 1.6 needs upload progress events, which fetch does not give. The
 *  CSRF token comes from the `XSRF-TOKEN` cookie the session middleware sets
 *  and travels as the `X-XSRF-TOKEN` header (ROUTES_SPEC §5).
 */
import type { ImageItem } from '../../types.js'

export interface UploadDefaults {
  format: 'webp' | 'avif' | 'original'
  quality?: number
}

export interface UploadSuccess {
  ok: true
  name: string
  originalSize: number
  storedSize: number
  savedPercent: number
}

export interface UploadFailure {
  ok: false
  name: string
  message: string
}

export type UploadResult = UploadSuccess | UploadFailure

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(/;\s*/)) {
    const [key, ...rest] = part.split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function uploadFile(file: File, defaults: UploadDefaults): Promise<UploadResult> {
  return new Promise((resolve) => {
    const body = new FormData()
    body.append('file', file, file.name)
    body.append('format', defaults.format)
    if (defaults.format !== 'original' && defaults.quality !== undefined) {
      body.append('quality', String(defaults.quality))
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/uploads')
    xhr.responseType = 'json'
    const token = readCookie('XSRF-TOKEN')
    if (token) xhr.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(token))

    xhr.onload = () => {
      const payload = xhr.response as
        | { message?: string, image?: ImageItem, originalSize?: number, storedSize?: number, savedPercent?: number }
        | null
      if (xhr.status === 201 && payload?.image) {
        resolve({
          ok: true,
          name: payload.image.name,
          originalSize: payload.originalSize ?? 0,
          storedSize: payload.storedSize ?? 0,
          savedPercent: payload.savedPercent ?? 0,
        })
      }
      else {
        resolve({
          ok: false,
          name: file.name,
          message: payload?.message ?? `Upload failed (HTTP ${xhr.status}).`,
        })
      }
    }
    xhr.onerror = () => resolve({ ok: false, name: file.name, message: 'The upload could not reach the server.' })
    xhr.send(body)
  })
}
