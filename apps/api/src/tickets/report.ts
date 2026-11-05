import { and, count, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  DEADLINE_HOURS,
  deadlineAtFor,
  isOpenTicketStatus,
  publicReportRequestSchema,
  publicReportResponseSchema,
  type PublicReport,
  type PublicReportRequest,
} from '@stoerdesk/shared'

import { loadEnv } from '../config/env'
import type { Database } from '../db/client'
import { objects, settings, ticketEvents, ticketPhotos, tickets } from '../db/schema'
import { generateQrToken } from '../objects/qr'
import { readDeadlineHours } from './deadline'
import { verifyAltchaPayload, type AltchaPayload } from './altcha'
import { MAX_REPORT_PHOTOS, saveReportPhotos } from './photos'
import { isReportSuspicious, recordReportAttempt } from './spam'

/**
 * Public report endpoint (`specs/06-report-form.md` §7.3/§7.5, WP-M2-04b).
 *
 * One unauthenticated `POST` writes one `tickets` row plus one append-only
 * `created` event in one transaction. `client_uuid` is the idempotency key of the
 * offline outbox replay (§7.3.3), the QR token travels in the body, and the rate
 * limit per IP and per token stays with the spam package WP-M2-07 (§7.6).
 * WP-M2-04c adds the photo data URLs of §7.4: they are verified by magic bytes and
 * written to the uploads volume after the ticket transaction.
 */

type Db = Database['database']

/** §4.8.1: more than ten minutes of deviation in either direction is a skew. */
const CLOCK_SKEW_TOLERANCE_MS = 10 * 60 * 1000

/** §7.3.4: QR reports are always `normal` (`PLAN.md` §10, ADR-0008). */

class ReportRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ReportRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new ReportRouteError(400, 'invalid_request', { fields })
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { code?: unknown; cause?: { code?: unknown } }

  return candidate.code === '23505' || candidate.cause?.code === '23505'
}

/** §7.3.4 — the server clock wins as soon as the device clock is untrustworthy. */
export function reportTimes(
  input: PublicReportRequest,
  receivedAt = new Date(),
  hours: number = DEADLINE_HOURS.normal,
) {
  const deviceTime = input.reportedAt === undefined ? undefined : new Date(input.reportedAt)
  const clockSkewed =
    deviceTime !== undefined &&
    Math.abs(deviceTime.getTime() - receivedAt.getTime()) > CLOCK_SKEW_TOLERANCE_MS
  const reportedAt = deviceTime === undefined || clockSkewed ? receivedAt : deviceTime

  return {
    reportedAt,
    receivedAt,
    clockSkewed,
    deadlineAt: deadlineAtFor(reportedAt, 'normal', { normal: hours }),
  }
}

async function photoCount(database: Db, ticketId: string): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(ticketPhotos)
    .where(eq(ticketPhotos.ticketId, ticketId))

  return Number(row?.total ?? 0)
}

async function reportOf(database: Db, row: typeof tickets.$inferSelect): Promise<PublicReport> {
  if (row.statusToken === null) {
    throw new ReportRouteError(500, 'status_token_missing', { fields: ['statusToken'] })
  }

  return publicReportResponseSchema.parse({
    ticketId: row.id,
    ticketNo: row.ticketNo,
    status: row.status,
    statusToken: row.statusToken,
    reportedAt: row.reportedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    clockSkewed: row.clockSkewed,
    photoCount: await photoCount(database, row.id),
  })
}

/**
 * Writes one report (§7.5). `replayed` is service-internal and decides `200`
 * versus `201`; it never reaches the response body. Photos are stored only for a
 * new ticket: the idempotent repeat ignores its photo array (§7.4).
 */
export async function createPublicReport(
  database: Db,
  input: PublicReportRequest,
  storage: { uploadDir: string; maxPhotoBytes: number },
  context: { ip: string; altchaSecret: string },
): Promise<{ report: PublicReport; replayed: boolean }> {
  const [object] = await database
    .select()
    .from(objects)
    .where(and(eq(objects.qrToken, input.qrToken), eq(objects.active, true)))
    .limit(1)

  if (object === undefined) {
    // A retired token is a plain 404 here: the form submits the current token it
    // resolved through `GET /api/v1/public/qr/:token` (§9.2).
    throw new ReportRouteError(404, 'qr_token_not_found', {})
  }

  if (input.text === undefined && input.faultTemplateKeys.length === 0) {
    throw new ReportRouteError(422, 'report_text_required', {
      fields: ['text', 'faultTemplateKeys'],
    })
  }

  // §7.8.3: the duplicate hint of WP-M2-08. An unknown or foreign parent is a
  // client error; a parent of the same object that was closed in the meantime is
  // ignored — the report is still created, a race is not the reporter's fault.
  let parentTicketId: string | null = null

  if (input.parentTicketId !== undefined) {
    const [parent] = await database
      .select({ id: tickets.id, objectId: tickets.objectId, status: tickets.status })
      .from(tickets)
      .where(eq(tickets.id, input.parentTicketId))
      .limit(1)

    if (parent === undefined || parent.objectId !== object.id) {
      throw new ReportRouteError(422, 'duplicate_parent_invalid', {
        fields: ['parentTicketId'],
      })
    }

    parentTicketId = isOpenTicketStatus(parent.status) ? parent.id : null
  }

  if (input.contact.phone === undefined && input.contact.email === undefined) {
    throw new ReportRouteError(422, 'contact_required', {
      fields: ['contact.phone', 'contact.email'],
    })
  }

  const [existing] = await database
    .select()
    .from(tickets)
    .where(eq(tickets.clientUuid, input.clientUuid))
    .limit(1)

  if (existing !== undefined) {
    return { report: await reportOf(database, existing), replayed: true }
  }

  await recordReportAttempt(database, { ip: context.ip, qrToken: input.qrToken })

  const suspicious = await isReportSuspicious(database, {
    ip: context.ip,
    qrToken: input.qrToken,
  })

  let suspectedSpam = input.website !== undefined && input.website !== ''

  if (!suspectedSpam && suspicious) {
    const verified =
      input.verification !== undefined &&
      (await verifyAltchaPayload(input.verification as AltchaPayload, context.altchaSecret))

    if (!verified) {
      if (context.altchaSecret === '') {
        // Without a configured captcha a suspicious report must still survive (§7.6).
        suspectedSpam = true
      } else {
        throw new ReportRouteError(400, 'captcha_required', { fields: ['verification'] })
      }
    }
  }

  const deadlineHours = await readDeadlineHours(database)
  const times = reportTimes(input, new Date(), deadlineHours.normal)

  const [brandingRow] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'branding'))
    .limit(1)

  const titleEnabled =
    brandingRow?.value !== null &&
    brandingRow?.value !== undefined &&
    typeof brandingRow?.value === 'object' &&
    typeof (brandingRow?.value as { titleEnabled?: unknown }).titleEnabled === 'boolean'
      ? (brandingRow?.value as { titleEnabled: boolean }).titleEnabled
      : false

  const insertValues = {
    objectId: object.id,
    status: 'NEW',
    priority: 'normal',
    source: 'QR',
    description: input.text ?? null,
    faultTemplateKeys: input.faultTemplateKeys,
    reporterName: input.contact.name ?? null,
    reporterPhone: input.contact.phone ?? null,
    reporterEmail: input.contact.email ?? null,
    clientUuid: input.clientUuid,
    statusToken: generateQrToken(),
    suspectedSpam,
    parentTicketId,
    title: titleEnabled ? (input.title ?? null) : null,
    ...times,
  }

  let created: typeof tickets.$inferSelect | undefined

  try {
    created = await database.transaction(async (tx) => {
      const [row] = await tx
        .insert(tickets)
        .values(insertValues)
        .onConflictDoNothing({ target: tickets.clientUuid })
        .returning()

      if (row === undefined) {
        return undefined
      }

      await tx.insert(ticketEvents).values({
        ticketId: row.id,
        type: 'created',
        actorKind: 'public',
        actorUserId: null,
        payload: {
          locale: input.locale,
          source: 'QR',
          faultTemplateKeys: input.faultTemplateKeys,
          textLength: input.text?.length ?? 0,
          title: input.title ?? null,
        },
      })

      return row
    })
  } catch (error) {
    // A concurrent double submit loses against the unique index — §7.3.3 answers
    // the same `200` with the existing ticket.
    if (!isUniqueViolation(error)) {
      throw error
    }
  }

  if (created === undefined) {
    const [existing] = await database.select().from(tickets).where(eq(tickets.clientUuid, input.clientUuid)).limit(1)

    if (existing === undefined) {
      throw new ReportRouteError(409, 'ticket_not_found', { fields: ['clientUuid'] })
    }

    return { report: await reportOf(database, existing), replayed: true }
  }

  // §7.4: photos belong to the new ticket only; a repeat keeps the gallery it has.
  if (input.photos.length > 0) {
    await saveReportPhotos({ database, ...storage }, created.id, input.photos)
  }

  return { report: await reportOf(database, created), replayed: false }
}

export type PublicReportRouteOptions = {
  database: Db
  uploadDir: string
  maxPhotoBytes: number
}

export const publicReportRoutes = fp<PublicReportRouteOptions>(
  async (app, { database, uploadDir, maxPhotoBytes }) => {
    // §7.4: six photos of `UPLOAD_MAX_BYTES` plus base64 headroom in one JSON body.
    const photoBodyLimit = Math.ceil(MAX_REPORT_PHOTOS * maxPhotoBytes * 1.4)
    const { ALTCHA_SECRET } = loadEnv()

    app.post(
      '/api/v1/public/tickets',
      { bodyLimit: photoBodyLimit },
      async (request, reply) => {
        const parsed = publicReportRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        const { report, replayed } = await createPublicReport(
          database,
          parsed.data,
          { uploadDir, maxPhotoBytes },
          { ip: request.ip, altchaSecret: ALTCHA_SECRET },
        )

        return reply.code(replayed ? 200 : 201).send(report)
      },
    )
  },
  { name: 'public-report-routes' },
)
