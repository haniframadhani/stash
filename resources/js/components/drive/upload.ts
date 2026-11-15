/** One file per XHR (ROUTES_SPEC §4): the queue needs upload progress events,
 *  which fetch does not give. The CSRF token comes from the `XSRF-TOKEN` cookie
 *  the session middleware sets and travels as the `X-XSRF-TOKEN` header
 *  (ROUTES_SPEC §5). The server caps concurrent encodes; the client keeps its
 *  own small concurrency so progress is per file (UI_SPEC §4).
 */
export interface ConvertOptions {
  format: 'webp' | 'avif' | 'original'
  quality?: number
  maxDimension?: number
}

export interface UploadOutcome {
  ok: boolean
  /** True when cancel() aborted the request — not an error to show. */
  canceled: boolean
  name: string
  originalSize?: number
  storedSize?: number
  savedPercent?: number
  message?: string
}

export interface UploadHandle {
  promise: Promise<UploadOutcome>
  cancel: () => void
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(/;\s*/)) {
    const [key, ...rest] = part.split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function startUpload(
  file: File,
  options: ConvertOptions,
  onProgress?: (percent: number) => void,
): UploadHandle {
  const body = new FormData()
  body.append('file', file, file.name)
  body.append('format', options.format)
  if (options.format !== 'original' && options.quality !== undefined) {
    body.append('quality', String(options.quality))
  }
  if (options.maxDimension !== undefined) {
    body.append('maxDimension', String(options.maxDimension))
  }

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/uploads')
  xhr.responseType = 'json'
  const token = readCookie('XSRF-TOKEN')
  if (token) xhr.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(token))

  const promise = new Promise<UploadOutcome>((resolve) => {
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onload = () => {
      const payload = xhr.response as
        | { message?: string, image?: { name?: string }, originalSize?: number, storedSize?: number, savedPercent?: number }
        | null
      if (xhr.status === 201 && payload?.image) {
        resolve({
          ok: true,
          canceled: false,
          name: payload.image.name ?? file.name,
          originalSize: payload.originalSize ?? file.size,
          storedSize: payload.storedSize ?? 0,
          savedPercent: payload.savedPercent ?? 0,
        })
      } else {
        resolve({
          ok: false,
          canceled: false,
          name: file.name,
          message: payload?.message ?? `Upload failed (HTTP ${xhr.status}).`,
        })
      }
    }
    xhr.onerror = () => resolve({ ok: false, canceled: false, name: file.name, message: 'The upload could not reach the server.' })
    xhr.onabort = () => resolve({ ok: false, canceled: true, name: file.name })
    xhr.send(body)
  })

  return {
    promise,
    cancel: () => xhr.abort(),
  }
}
