import { z } from 'zod'

/**
 * Admin group API schemas.
 *
 * A group is a named collection of users (`groups` + `user_groups`, migration
 * `0000_base_tables`). Groups are the target of ticket assignment in a later
 * phase; this WP only provides group CRUD. Membership rows live in `userGroups`
 * and are resolved on read, so a group counts its members and refuses deletion
 * while members remain.
 */

export const groupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  userCount: z.number().int().min(0),
})

export const groupListResponseSchema = z.object({
  groups: z.array(groupSummarySchema),
})

export const createGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const updateGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
})

export type GroupSummary = z.infer<typeof groupSummarySchema>
export type GroupListResponse = z.infer<typeof groupListResponseSchema>
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>
export type UpdateGroupRequest = z.infer<typeof updateGroupRequestSchema>
