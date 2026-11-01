/**
 * Client-side photo compression of the public report form (`specs/06-report-form.md`
 * §7.2/§7.4, WP-M2-05b).
 *
 * A reporter's phone photo is far larger than the server needs: `PLAN.md` §10 caps the
 * longest edge at 1600 px and encodes as JPEG quality 0.8. The canvas output is a data
 * URL, which is exactly the transport of §7.4 — no upload round trip and no server-side
 * re-compression. The server still verifies the magic bytes (WP-M2-04c).
 */

/** `PLAN.md` §10: longest edge of a compressed report photo. */
export const MAX_PHOTO_DIMENSION = 1600

/** `PLAN.md` §10: JPEG quality of a compressed report photo. */
export const PHOTO_JPEG_QUALITY = 0.8

export type CompressOptions = {
  maxDimension?: number
  quality?: number
}

export type CompressedPhoto = {
  dataUrl: string
  width: number
  height: number
  sizeBytes: number
}

/** Same `{ code }` shape as the API errors — the page maps it to an i18n key. */
export class PhotoError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'PhotoError'
    this.code = code
  }
}

/**
 * Proportional size of a bitmap whose longest edge is capped at `max`. A bitmap that
 * already fits is never up-scaled, and an edge never rounds down to 0 px.
 */
export function scaledSize(
  width: number,
  height: number,
  max: number = MAX_PHOTO_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height)

  if (longest <= max) {
    return { width, height }
  }

  const factor = max / longest

  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

/** Decoded byte count of a data URL, derived from its base64 payload. */
export function dataUrlByteSize(dataUrl: string): number {
  const separator = dataUrl.indexOf(',')
  const payload = separator === -1 ? '' : dataUrl.slice(separator + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0

  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

/**
 * Decodes the file through `createImageBitmap`, scales it into a canvas and returns the
 * JPEG data URL plus its decoded size. An undecodable file (including HEIC, which the
 * browser cannot decode) and a 0 px bitmap are `photo_type_unsupported`, never a silent
 * skip.
 */
export async function compressImage(
  file: Blob,
  options: CompressOptions = {},
): Promise<CompressedPhoto> {
  const maxDimension = options.maxDimension ?? MAX_PHOTO_DIMENSION
  const quality = options.quality ?? PHOTO_JPEG_QUALITY
  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PhotoError('photo_type_unsupported')
  }

  try {
    if (bitmap.width === 0 || bitmap.height === 0) {
      throw new PhotoError('photo_type_unsupported')
    }

    const size = scaledSize(bitmap.width, bitmap.height, maxDimension)
    const canvas = document.createElement('canvas')

    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')

    if (context === null) {
      throw new PhotoError('photo_type_unsupported')
    }

    context.drawImage(bitmap, 0, 0, size.width, size.height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)

    return {
      dataUrl,
      width: size.width,
      height: size.height,
      sizeBytes: dataUrlByteSize(dataUrl),
    }
  } finally {
    bitmap.close()
  }
}
