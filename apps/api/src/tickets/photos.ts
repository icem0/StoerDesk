import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import { PERMISSIONS } from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { ticketPhotos, tickets } from '../db/schema'

/**
 * Report photo upload (`specs/06-report-form.md` §7.4, WP-M2-04c).
 *
 * The photos of a report arrive as base64 data URLs in the same JSON body. The
 * client claim is never trusted: every photo is decoded, capped against
 * `UPLOAD_MAX_BYTES` and verified by magic bytes before a single byte is written
 * to the uploads volume. Files live under
 * `<UPLOAD_DIR>/tickets/<ticketId>/<photoId>.<ext>` and `ticket_photos` stores the
 * path **relative** to `UPLOAD_DIR` (§4.10). The volume is never served — reading
 * a photo is phase 10.
 */

type Db = Database['database']

/** `PLAN.md` §10 and §4.10: at most six photos per report. */
export const MAX_REPORT_PHOTOS = 6

const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const

/** Data URL of a claimed `image/jpeg` or `image/png`, single line, base64 payload. */
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/

export type PhotoUploadOptions = {
  database: Db
  uploadDir: string
  maxPhotoBytes: number
}

export type StoredPhoto = {
  id: string
  filePath: string
  mimeType: string
  sizeBytes: number
}

/** Same `{ code, params }` envelope as the report route — never translated text. */
class PhotoUploadError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'PhotoUploadError'
    this.statusCode = 422
    this.code = code
    this.params = params
  }
}

/** Magic-byte check of §7.4; `null` means "not an accepted image type". */
export function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  for (const signature of IMAGE_SIGNATURES) {
    const matches = signature.magic.every((byte, index) => buffer[index] === byte)

    if (matches) {
      return { mime: signature.mime, ext: signature.ext }
    }
  }

  return null
}

type DecodedPhoto = { buffer: Buffer; mime: string; ext: string }

function decodePhoto(dataUrl: string, index: number, maxBytes: number): DecodedPhoto {
  const claimed = DATA_URL_PATTERN.exec(dataUrl)
  const claimedMime = claimed?.[1]
  const payload = claimed?.[2]

  if (claimedMime === undefined || payload === undefined) {
    throw new PhotoUploadError('photo_type_unsupported', { index })
  }

  const buffer = Buffer.from(payload, 'base64')

  if (buffer.byteLength > maxBytes) {
    throw new PhotoUploadError('photo_too_large', { index, maxBytes })
  }

  const detected = detectImageType(buffer)

  // The bytes win over the claim: a PNG data URL holding JPEG bytes is rejected.
  if (detected === null || detected.mime !== claimedMime) {
    throw new PhotoUploadError('photo_type_unsupported', { index })
  }

  return { buffer, mime: detected.mime, ext: detected.ext }
}

/**
 * Decodes, verifies and stores the photos of one created report. A rejected photo
 * aborts the whole request before a single byte is written (§7.4), so the caller
 * either gets every `StoredPhoto` or an error and no half-written ticket gallery.
 */
export async function saveReportPhotos(
  options: PhotoUploadOptions,
  ticketId: string,
  photos: string[],
): Promise<StoredPhoto[]> {
  if (photos.length > MAX_REPORT_PHOTOS) {
    throw new PhotoUploadError('photo_limit_exceeded', {
      limit: MAX_REPORT_PHOTOS,
      received: photos.length,
    })
  }

  const decoded = photos.map((photo, index) => decodePhoto(photo, index, options.maxPhotoBytes))
  const stored: StoredPhoto[] = []

  for (const photo of decoded) {
    // The file name is a UUID, never an object number or an uploaded name (§15).
    const photoId = randomUUID()
    const filePath = `tickets/${ticketId}/${photoId}.${photo.ext}`

    await mkdir(join(options.uploadDir, 'tickets', ticketId), { recursive: true })
    await writeFile(join(options.uploadDir, filePath), photo.buffer)

    const [row] = await options.database
      .insert(ticketPhotos)
      .values({
        ticketId,
        filePath,
        mimeType: photo.mime,
        sizeBytes: photo.buffer.byteLength,
      })
      .returning({
        id: ticketPhotos.id,
        filePath: ticketPhotos.filePath,
        mimeType: ticketPhotos.mimeType,
        sizeBytes: ticketPhotos.sizeBytes,
      })

    if (row === undefined) {
      throw new PhotoUploadError('photo_not_stored', { index: stored.length })
    }

    stored.push(row)
  }

  return stored
}

/**
 * Authenticated photo download (`PLAN.md` §4.10, WP-M4-08).
 *
 * The uploads volume is never served directly. This guard-protected endpoint
 * streams a single stored photo back to the session holder with its original
 * MIME type, so the web app can render ticket photos as images. Errors keep the
 * `{ code, params }` envelope — never translated text.
 */

class PhotoServeRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'PhotoServeRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

type PhotoServeOptions = {
  database: Db
  uploadDir: string
}

export const photoServeRoutes = fp<PhotoServeOptions>(
  async (app, { database, uploadDir }) => {
    app.get<{ Params: { ticketNo: string; photoId: string } }>(
      '/api/v1/tickets/:ticketNo/photos/:photoId',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async (request, reply) => {
        const { ticketNo, photoId } = request.params

        const [ticketRow] = await database
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.ticketNo, ticketNo))
          .limit(1)

        if (ticketRow === undefined) {
          throw new PhotoServeRouteError(404, 'ticket_not_found', { fields: ['ticketNo'] })
        }

        const [photoRow] = await database
          .select({ id: ticketPhotos.id, filePath: ticketPhotos.filePath, mimeType: ticketPhotos.mimeType })
          .from(ticketPhotos)
          .where(and(eq(ticketPhotos.id, photoId), eq(ticketPhotos.ticketId, ticketRow.id)))
          .limit(1)

        if (photoRow === undefined) {
          throw new PhotoServeRouteError(404, 'photo_not_found', { fields: ['photoId'] })
        }

        const buffer = await readFile(join(uploadDir, photoRow.filePath))

        return reply
          .code(200)
          .header('content-type', photoRow.mimeType)
          .header('content-disposition', 'inline')
          .send(buffer)
      },
    )
  },
  { name: 'stoerdesk-ticket-photo-serve' },
)
