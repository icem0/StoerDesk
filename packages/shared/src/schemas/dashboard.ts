import { z } from 'zod'

import { TICKET_PRIORITIES, type TimelineState } from '../timeline.js'
import { ticketNoSchema, ticketStatusSchema } from './ticket.js'

/**
 * Dashboard snapshot contracts (`specs/11-dashboard.md` §11.2, WP-M9-04).
 *
 * `GET /api/v1/dashboard` answers one snapshot, computed in the database.
 * Optional sections (`onCall`, `channels`) are `null` when the caller has no
 * permission for them — the snapshot never fails because a section is missing.
 */

export type TicketStatus = z.infer<typeof ticketStatusSchema>

const onCallTileSchema = z.object({
  kind: z.enum(['confirmed', 'planned', 'unstaffed']),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  endsAt: z.iso.datetime().nullable(),
  warning: z.enum(['oncall_unconfirmed', 'oncall_unstaffed']).nullable(),
})

const channelTileSchema = z.object({
  name: z.string(),
  lastSentAt: z.iso.datetime().nullable(),
  lastFailedAt: z.iso.datetime().nullable(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

/**
 * The five states of the bar (`specs/05-timeline.md` §5.3). The tuple is
 * checked against the type of the shared timeline function, so a state
 * cannot exist in one place only.
 */
const timelineStates = [
  'green',
  'yellow',
  'orange',
  'red',
  'stopped',
] as const satisfies readonly TimelineState[]

/**
 * One open ticket of the dashboard (WP-M10-30). Besides the fields of the
 * ticket the row carries the mini timeline of `specs/05-timeline.md` §5.3 —
 * the same values the ticket list answers — and the last entry of the
 * history, so the dashboard and the wall display show the same thing.
 */
const burningNowRowSchema = z.object({
  ticketNo: ticketNoSchema,
  objectName: z.string(),
  status: ticketStatusSchema,
  priority: z.enum(TICKET_PRIORITIES),
  deadlineAt: z.iso.datetime(),
  reportedAt: z.iso.datetime(),
  timelineState: z.enum(timelineStates),
  percent: z.number().min(0).max(100),
  remainingMs: z.number().int().nonnegative(),
  lastEvent: z.object({ type: z.string(), at: z.iso.datetime() }).nullable(),
})

/**
 * Evaluation block of the snapshot (`specs/11-dashboard.md` §11.4a, WP-M10-19,
 * ADR-0015): averages only — no median, no p90, no max, so the worst
 * reaction time is never calculated and never displayed on the dashboard.
 * Optional in the contract so a browser holding an older SSE frame still
 * parses; the dashboard service always answers it.
 */
const dashboardEvaluationsSchema = z.object({
  windowDays: z.number().int().positive(),
  tickets: z.number().int().nonnegative(),
  averageReviewMinutes: z.number().int().nonnegative().nullable(),
  averageFirstResponseMinutes: z.number().int().nonnegative().nullable(),
  averageAcknowledgeMinutes: z.number().int().nonnegative().nullable(),
  averageProcessingMinutes: z.number().int().nonnegative().nullable(),
})

export const dashboardSnapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  faultFree: z.object({
    since: z.iso.datetime().nullable(),
    days: z.number().int().nonnegative(),
    recordDays: z.number().int().nonnegative(),
  }),
  evaluations: dashboardEvaluationsSchema.optional(),
  tiles: z.object({
    open: z.number().int().nonnegative(),
    openByStatus: z.record(ticketStatusSchema, z.number().int().nonnegative()),
    overdue: z.number().int().nonnegative(),
    unreviewed: z.number().int().nonnegative(),
    poolSize: z.number().int().nonnegative(),
    onCall: onCallTileSchema.nullable(),
    channels: z.array(channelTileSchema).nullable(),
  }),
  burningNow: z.array(burningNowRowSchema),
})

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>
export type DashboardEvaluations = z.infer<typeof dashboardEvaluationsSchema>

/**
 * Dashboard settings (`specs/11-dashboard.md` §11.8,
 * specs/12-stats.md §12.6).
 *
 * Stored as jsonb rows of the existing `settings` table under the keys
 * `dashboard.tv_token`, `dashboard.tv_anonymize` and
 * `stats.conspicuous_threshold`. `tv_token` is a random 32-byte base64url
 * value: it is never logged and never answered by a public route except via its
 * own verification at `GET /api/v1/tv/:token`.
 */

export const dashboardSettingsSchema = z.object({
  tvToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  tvAnonymize: z.boolean(),
  conspicuousThreshold: z.number().int().min(1).max(100),
})

export const updateDashboardSettingsRequestSchema = z.object({
  tvToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  rotateTvToken: z.boolean().optional(),
  tvAnonymize: z.boolean().optional(),
  conspicuousThreshold: z.number().int().min(1).max(100).optional(),
})

export type DashboardSettings = z.infer<typeof dashboardSettingsSchema>
export type UpdateDashboardSettingsRequest = z.infer<
  typeof updateDashboardSettingsRequestSchema
>
