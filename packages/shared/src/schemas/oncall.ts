import { z } from 'zod'

/**
 * On-call pool API schemas (`specs/04-oncall.md` §4a.2, WP-M8-04).
 *
 * A pool name is trimmed, 1–100 characters and unique case-insensitively.
 * `groupId` is an optional UUID referencing `groups`.
 */

const trimmedName = z.string().trim().min(1).max(100)

const optionalGroupId = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value))

export const createPoolRequestSchema = z.object({
  name: trimmedName,
  groupId: optionalGroupId,
})

export const updatePoolRequestSchema = z.object({
  name: trimmedName.optional(),
  groupId: optionalGroupId,
  active: z.boolean().optional(),
})

export const oncallPoolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  groupId: z.string().uuid().nullable(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const poolListResponseSchema = z.object({
  pools: z.array(oncallPoolSchema.extend({ shiftCount: z.number() })),
})

export type CreatePoolRequest = z.infer<typeof createPoolRequestSchema>
export type UpdatePoolRequest = z.infer<typeof updatePoolRequestSchema>
export type OnCallPool = z.infer<typeof oncallPoolSchema>

/**
 * The display data of a person (`oncallMemberSchema`) — one pool member and one
 * technician of a shift. The readiness calendar names a technician from the
 * shift row, so the technician of a shift of a foreign pool travels with it
 * (ADR-0032, WP-M14-151). The answer of the shift list is guarded by `oncall.read`
 * like the members route of a pool; the gate to the names is in the web app
 * (`oncall.read_names`, WP-M14-131/132).
 */
const memberRow = z.object({
  id: z.string().uuid(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.string().email(),
})

const uuidOptional = z.string().uuid().optional()

const shiftState = z.enum([
  'UNFILLED',
  'DRAFT',
  'PLANNED',
  'CONFIRMED',
  'DECLINED',
  'SWAP_REQUESTED',
])

export const oncallShiftSchema = z.object({
  id: z.uuid(),
  poolId: z.uuid(),
  userId: z.string().uuid().nullable(),
  state: shiftState,
  startsAt: z.date(),
  endsAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  /** The technician of the shift (`specs/04-oncall.md` §4a.3, WP-M14-151). */
  technician: memberRow.nullable().optional(),
})

export const createShiftRequestSchema = z.object({
  poolId: z.string().uuid(),
  userId: uuidOptional,
  publish: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
})

export const generateShiftsRequestSchema = z.object({
  poolId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
})

export const generateShiftsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

export const shiftListResponseSchema = z.object({
  shifts: z.array(oncallShiftSchema),
})

/**
 * One step of the append-only shift history (`specs/04-oncall.md` §4a.10,
 * WP-M14-154a). The raw event payload stays on the server: the route names the
 * acting person, the person an assignment or a swap refers to, the state
 * transition of an assignment and the reason of a decline.
 */
export const oncallShiftHistoryEntrySchema = z.object({
  id: z.uuid(),
  type: z.string(),
  createdAt: z.date(),
  actor: memberRow.nullable(),
  person: memberRow.nullable(),
  fromState: shiftState.nullable(),
  toState: shiftState.nullable(),
  reason: z.string().nullable(),
})

export const oncallShiftHistoryResponseSchema = z.object({
  events: z.array(oncallShiftHistoryEntrySchema),
})

export const updateShiftRequestSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  publish: z.boolean().optional(),
})

const clientUuidOptional = z.string().uuid().optional()

export const confirmShiftRequestSchema = z.object({
  clientUuid: clientUuidOptional,
})

export const declineShiftRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  clientUuid: clientUuidOptional,
})

export const swapStatus = z.enum([
  'PENDING',
  'ACCEPTED',
  'APPROVED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
])

export const oncallSwapSchema = z.object({
  id: z.uuid(),
  shiftId: z.uuid(),
  requestedByUserId: z.string().uuid().nullable(),
  targetUserId: z.string().uuid().nullable(),
  status: swapStatus,
  acceptedByUserId: z.string().uuid().nullable(),
  acceptedAt: z.date().nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const swapRequestSchema = z.object({
  targetUserId: z.string().uuid().optional(),
})

export const swapIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const swapAcceptResponseSchema = z.object({
  swap: oncallSwapSchema,
  shiftChanged: z.boolean(),
})

export const oncallSwapListResponseSchema = z.object({
  swaps: z.array(
    oncallSwapSchema.extend({
      shift: z.object({
        id: z.uuid(),
        poolId: z.uuid(),
        poolName: z.string(),
        startsAt: z.date(),
        endsAt: z.date(),
      }),
    }),
  ),
})

/**
 * One duty window of the window plan (`specs/04-oncall.md` §4a.3.2, ADR-0035):
 * the weekday with the start and the end of the duty as the wall clock of
 * `Europe/Berlin`. The end is later than the start on the same day; a night
 * window is not part of this version.
 */
export const oncallWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((window) => window.end > window.start, {
    message: 'The end of a duty window is later than its start.',
    path: ['end'],
  })

export const oncallSettingsResponseSchema = z.object({
  weekStartWeekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  durationDays: z.number().int().min(1).max(28),
  swapRequiresAdminApproval: z.boolean(),
  escalateToGroupAfterMin: z.number().int().min(1).max(1440),
  reminderUnconfirmedH: z.number().int().min(1).max(720),
  unfilledWarningDays: z.number().int().min(1).max(365),
  defaultPoolId: z.string().uuid().nullable(),
  weeklyWindows: z.array(oncallWindowSchema),
})

export const updateOncallSettingsRequestSchema = z
  .object({
    'oncall.week_start_weekday': z.number().int().min(0).max(6).optional(),
    'oncall.start_time': z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    'oncall.duration_days': z.number().int().min(1).max(28).optional(),
    'oncall.swap_requires_admin_approval': z.boolean().optional(),
    'oncall.escalate_to_group_after_min': z.number().int().min(1).max(1440).optional(),
    'oncall.reminder_unconfirmed_h': z.number().int().min(1).max(720).optional(),
    'oncall.unfilled_warning_days': z.number().int().min(1).max(365).optional(),
    'oncall.default_pool_id': z.string().uuid().nullable().optional(),
    'oncall.weekly_windows': z
      .array(oncallWindowSchema)
      .max(7)
      .refine(
        (windows) => new Set(windows.map((window) => window.weekday)).size === windows.length,
        { message: 'At most one duty window per weekday.', path: ['oncall.weekly_windows'] },
      )
      .optional(),
  })
  .strict()

export type OnCallShift = z.infer<typeof oncallShiftSchema>
export type OnCallShiftHistoryEntry = z.infer<typeof oncallShiftHistoryEntrySchema>
export type OnCallShiftHistoryResponse = z.infer<typeof oncallShiftHistoryResponseSchema>
export type CreateShiftRequest = z.infer<typeof createShiftRequestSchema>
export type GenerateShiftsRequest = z.infer<typeof generateShiftsRequestSchema>
export type GenerateShiftsResponse = z.infer<typeof generateShiftsResponseSchema>
export type UpdateShiftRequest = z.infer<typeof updateShiftRequestSchema>
export type OnCallSwap = z.infer<typeof oncallSwapSchema>
export type SwapRequest = z.infer<typeof swapRequestSchema>
export type SwapAcceptResponse = z.infer<typeof swapAcceptResponseSchema>
export type OncallSwapListResponse = z.infer<typeof oncallSwapListResponseSchema>
export type OnCallSettingsResponse = z.infer<typeof oncallSettingsResponseSchema>
export type UpdateOncallSettingsRequest = z.infer<typeof updateOncallSettingsRequestSchema>
export type OncallWindowInput = z.infer<typeof oncallWindowSchema>

/** Response of `GET /api/v1/oncall/ical-url`: a relative URL the caller resolves
 * against its own origin; the token itself stays on the server (WP-M8-14b). */
export const icalUrlResponseSchema = z.object({
  url: z.string(),
})

export type IcalUrlResponse = z.infer<typeof icalUrlResponseSchema>

/** One pool member offered as a swap target (WP-M8-14b). */
export const oncallMemberSchema = memberRow

export const oncallMemberListResponseSchema = z.object({
  members: z.array(oncallMemberSchema),
})

export type OncallMember = z.infer<typeof oncallMemberSchema>
export type OncallMemberListResponse = z.infer<typeof oncallMemberListResponseSchema>
