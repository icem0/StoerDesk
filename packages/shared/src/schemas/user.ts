import { z } from 'zod'

/**
 * Admin user API schemas (WP-M1-09).
 *
 * The public representation is deliberately minimal: no password hash and no
 * session or permission rows. Role keys are stable identifiers, permission keys
 * belong to `meResponseSchema` and are resolved per request.
 */

export const userLocaleSchema = z.enum(['de', 'en'])

const roleKeySchema = z.string().trim().min(1).max(64)

const roleKeysSchema = z
  .array(roleKeySchema)
  .transform((keys) => [...new Set(keys)])
  .pipe(z.array(roleKeySchema))

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  locale: userLocaleSchema,
  active: z.boolean(),
  roleKeys: z.array(z.string()),
})

export const userListResponseSchema = z.object({
  users: z.array(userSummarySchema),
})

export const createUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(256),
  locale: userLocaleSchema.default('de'),
  active: z.boolean().default(true),
  roleKeys: roleKeysSchema.default([]),
})

export const updateUserRequestSchema = z.object({
  locale: userLocaleSchema.optional(),
  active: z.boolean().optional(),
  roleKeys: roleKeysSchema.optional(),
  password: z.string().min(12).max(256).optional(),
})

export type UserSummary = z.infer<typeof userSummarySchema>
export type UserListResponse = z.infer<typeof userListResponseSchema>
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
