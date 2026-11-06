import { z } from 'zod'

/**
 * On-call pool API schemas (`specs/04-oncall.md` §4a.2, WP-M8-04).
 *
 * A pool name is trimmed, 1–100 characters and unique case-insensitively.
 * `groupId` is an optional UUID referencing `groups`.
 */

const trimmedName = z.string().trim().min(1).max(100)

const optionalGroupId = z.string().uuid().nullable().optional().transform((value) => (value === '' ? null : value))

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
