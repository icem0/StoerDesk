import { z } from 'zod'

import { TICKET_PRIORITIES } from '../timeline.js'

/**
 * Statistics filter and response contracts (`specs/12-stats.md` §12.1–§12.5,
 * WP-M9-04).
 *
 * Every statistics read takes the same filter object. The four JSON routes of
 * `GET /api/v1/stats/*` share this schema: a malformed filter answers
 * `422 invalid_request` with field errors, an impossible range answers
 * `422 stats_range_invalid`.
 */

export const statsRangeInvalidCode = 'stats_range_invalid'

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parts = value.split('-')
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    )
  }, { message: 'not a valid calendar date' })

export const statsFilterSchema = z
  .object({
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    objectNo: z.string().trim().min(1).optional(),
    systemType: z.string().trim().min(1).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    technician: z.string().uuid().optional(),
    includeTest: z.boolean().optional(),
    includeSpam: z.boolean().optional(),
    bucket: z.enum(['day', 'week', 'month']).optional(),
  })
  .refine(
    (data) => data.from === undefined || data.to === undefined || data.from <= data.to,
    { message: 'from must not be after to', path: ['from'] },
  )
  .refine(
    (data) => {
      if (data.from === undefined || data.to === undefined) {
        return true
      }

      const from = new Date(`${data.from}T00:00:00Z`)
      const to = new Date(`${data.to}T00:00:00Z`)
      return (to.getTime() - from.getTime()) / 86400000 <= 366
    },
    { message: 'the range may not exceed 366 days', path: ['to'] },
  )

export type StatsFilter = z.infer<typeof statsFilterSchema>

const reactionTimePhaseSchema = z.object({
  count: z.number().int().nonnegative(),
  medianMinutes: z.number().nonnegative(),
  averageMinutes: z.number().nonnegative(),
  p90Minutes: z.number().nonnegative(),
})

export const reactionTimesResponseSchema = z.object({
  review: reactionTimePhaseSchema,
  firstResponse: reactionTimePhaseSchema,
  acknowledge: reactionTimePhaseSchema,
  pausedTickets: z.number().int().nonnegative(),
  pauseMinutes: z.number().nonnegative(),
})

export type ReactionTimesResponse = z.infer<typeof reactionTimesResponseSchema>

const frequencySeriesPointSchema = z.object({
  bucketStart: z.iso.datetime(),
  total: z.number().int().nonnegative(),
})

const frequencyGroupSchema = z.object({
  key: z.string(),
  count: z.number().int().nonnegative(),
})

export const frequencyResponseSchema = z.object({
  series: z.array(frequencySeriesPointSchema),
  bySystemType: z.array(frequencyGroupSchema),
  byFaultTemplate: z.array(frequencyGroupSchema),
  bySource: z.array(frequencyGroupSchema),
})

export type FrequencyResponse = z.infer<typeof frequencyResponseSchema>

export const topObjectSchema = z.object({
  objectNo: z.string(),
  objectName: z.string(),
  count: z.number().int().nonnegative(),
  conspicuous: z.boolean(),
})

export const topObjectsResponseSchema = z.object({
  topObjects: z.array(topObjectSchema),
})

export type TopObjectsResponse = z.infer<typeof topObjectsResponseSchema>

export const complianceResponseSchema = z.object({
  acknowledged: z.number().int().nonnegative(),
  onTime: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  openOverdue: z.number().int().nonnegative(),
  onTimeRate: z.number().min(0).max(1).nullable(),
})

export type ComplianceResponse = z.infer<typeof complianceResponseSchema>

const declineReasonSchema = z.object({
  reason: z.string(),
  count: z.number().int().nonnegative(),
})

export const declinesResponseSchema = z.object({
  declineRate: z.number().min(0).max(1).nullable(),
  topReasons: z.array(declineReasonSchema),
})

export type DeclinesResponse = z.infer<typeof declinesResponseSchema>
