/** Failure taxonomy of the image pipeline (docs/IMAGE_PIPELINE.md §1 to §3).
 *  `status` is the HTTP status the controller should answer with; the upload
 *  endpoint (task 1.4) maps these to 413/415/422 responses.
 */
export class ImageConversionError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class UnsupportedInputError extends ImageConversionError {
  constructor(sniffed?: string) {
    super(
      'unsupported_input',
      415,
      sniffed
        ? `"${sniffed}" is not an accepted image format (jpeg, png, webp, avif, gif)`
        : 'Not an accepted image (jpeg, png, webp, avif, gif)',
    )
  }
}

export class ImageTooLargeError extends ImageConversionError {
  constructor(maxBytes: number) {
    super('too_large', 413, `Image exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB upload cap`)
  }
}

export class PixelCapExceededError extends ImageConversionError {
  constructor(maxPixels: number) {
    super('pixel_cap', 422, `Image exceeds the ${maxPixels} decoded-pixel cap`)
  }
}

export class AnimatedFormatError extends ImageConversionError {
  constructor() {
    // sharp 0.35.5 encodes animated AVIF without error but flattens it to a
    // single frame (output pages: 1), so it is rejected, never allowed.
    super('animated_avif', 422, 'AVIF is not available for animated images; choose WebP or Original')
  }
}

export class FormatUnavailableError extends ImageConversionError {
  constructor(format: string) {
    super('format_unavailable', 422, `Format "${format}" is not available in this build`)
  }
}
