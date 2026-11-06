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
})

export const createShiftRequestSchema = z.object({
  poolId: z.string().uuid(),
  userId: uuidOptional,
  publish: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  createdByUserId: uuidOptional,
})

export const generateShiftsRequestSchema = z.object({
  poolId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  createdByUserId: uuidOptional,
})

export const generateShiftsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

export const shiftListResponseSchema = z.object({
  shifts: z.array(oncallShiftSchema),
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

export const oncallSettingsResponseSchema = z.object({
  weekStartWeekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  durationDays: z.number().int().min(1).max(28),
  swapRequiresAdminApproval: z.boolean(),
  escalateToGroupAfterMin: z.number().int().min(1).max(1440),
  reminderUnconfirmedH: z.number().int().min(1).max(720),
  unfilledWarningDays: z.number().int().min(1).max(365),
  defaultPoolId: z.string().uuid().nullable(),
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
  })
  .strict()

export type OnCallShift = z.infer<typeof oncallShiftSchema>
export type CreateShiftRequest = z.infer<typeof createShiftRequestSchema>
export type GenerateShiftsRequest = z.infer<typeof generateShiftsRequestSchema>
export type GenerateShiftsResponse = z.infer<typeof generateShiftsResponseSchema>
export type UpdateShiftRequest = z.infer<typeof updateShiftRequestSchema>
export type OnCallSettingsResponse = z.infer<typeof oncallSettingsResponseSchema>
export type UpdateOncallSettingsRequest = z.infer<typeof updateOncallSettingsRequestSchema>
