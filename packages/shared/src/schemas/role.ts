import { z } from 'zod'

/**
 * Admin role API schemas (WP-M1-09b, `specs/01-rbac.md` §3.8).
 *
 * `key` addresses a role: keys are unique in `roles` (§4.1) and are what the seed,
 * the permission guard and the roles UI work with. Permission keys are catalog
 * constants, never translated text.
 */

export const roleKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,63}$/, 'role keys are lower case slugs')

const permissionKeysSchema = z
  .array(z.string())
  .transform((keys) => [...new Set(keys)])
  .pipe(z.array(z.string()))

export const roleSummarySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  isSystem: z.boolean(),
  permissionKeys: z.array(z.string()),
  userCount: z.number().int().min(0),
})

export const roleListResponseSchema = z.object({
  roles: z.array(roleSummarySchema),
})

export const createRoleRequestSchema = z.object({
  key: roleKeySchema,
  permissionKeys: permissionKeysSchema.default([]),
})

export const updateRoleRequestSchema = z.object({
  permissionKeys: permissionKeysSchema.optional(),
})

export type RoleKeyInput = z.infer<typeof roleKeySchema>
export type RoleSummary = z.infer<typeof roleSummarySchema>
export type RoleListResponse = z.infer<typeof roleListResponseSchema>
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>
