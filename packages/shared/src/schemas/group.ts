import { z } from 'zod'

/**
 * Admin group API schemas.
 *
 * A group is a named collection of users (`groups` + `user_groups`, migration
 * `0000_base_tables`). Groups are the target of ticket assignment in a later
 * phase; WP-M4-02 provides group CRUD and WP-M4-15 exposes the membership rows
 * in `userGroups` (a member is a user of the group, its count is resolved on
 * read and a group refuses deletion while members remain).
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

export const groupMemberSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  givenName: z.string(),
  familyName: z.string(),
})

export const groupMemberListResponseSchema = z.object({
  members: z.array(groupMemberSchema),
})

export const addGroupMemberRequestSchema = z.object({
  userId: z.uuid(),
})

export const groupMembershipSchema = z.object({
  userId: z.uuid(),
  groupId: z.uuid(),
})

export type GroupSummary = z.infer<typeof groupSummarySchema>
export type GroupListResponse = z.infer<typeof groupListResponseSchema>
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>
export type UpdateGroupRequest = z.infer<typeof updateGroupRequestSchema>
export type GroupMember = z.infer<typeof groupMemberSchema>
export type GroupMemberListResponse = z.infer<typeof groupMemberListResponseSchema>
export type AddGroupMemberRequest = z.infer<typeof addGroupMemberRequestSchema>
export type GroupMembership = z.infer<typeof groupMembershipSchema>
