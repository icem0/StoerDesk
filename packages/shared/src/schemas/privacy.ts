import { z } from 'zod'

import { ticketNoSchema } from './ticket.js'

/**
 * Personal-data export and erasure (`specs/14-nfr.md` §15.2, ADR-0014 decision 4,
 * WP-M10-16).
 *
 * Both contracts belong to the session-only admin surface: no API-key scope reaches
 * them. The export answers the data of the data subject only — the reporter contact
 * fields, the photo metadata and the machine-readable audit rows — and never the
 * status token, the ticket content or an event payload, so an export can never
 * carry the internal notes of other users.
 */

export const personalDataExportResponseSchema = z.object({
  ticketNo: ticketNoSchema,
  reporter: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  photos: z.array(
    z.object({
      id: z.uuid(),
      filePath: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      createdAt: z.iso.datetime(),
    }),
  ),
  events: z.array(
    z.object({
      type: z.string(),
      actorKind: z.string(),
      actorUserId: z.uuid().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
})

/** Erasure reason of §15.2 — five to thousand characters, never a default. */
export const personalDataEraseRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
})

/**
 * `alreadyErased` marks the idempotent repeat: `200` again, no second event.
 * The ticket and its audit trail are never deleted here.
 */
export const personalDataEraseResponseSchema = z.object({
  ticketNo: ticketNoSchema,
  alreadyErased: z.boolean(),
})

export type PersonalDataExport = z.infer<typeof personalDataExportResponseSchema>
export type PersonalDataEraseRequest = z.infer<typeof personalDataEraseRequestSchema>
export type PersonalDataEraseResponse = z.infer<typeof personalDataEraseResponseSchema>
