# WP-M4-15: User-group membership API (server)

format: small-model
status: planned
depends-on: WP-M4-02
phase: 4
context-budget: 20k tokens
spec: PLAN.md §6 (data model: `groups`, `user_groups`), PLAN.md §14 (settings: users, groups)
spec-lines: 40

files-read:

- apps/api/src/admin/groups.ts — route pattern, error envelope, `group_not_found`
- apps/api/src/admin/users.ts — transactional writes, `user_not_found`, `unknown_role_key`
- apps/api/src/oncall/swaps.ts — how `userGroups` resolves pool members
- apps/api/src/db/schema.ts — `userGroups` columns and its FKs
- packages/shared/src/schemas/group.ts — the group contracts of WP-M4-02
- packages/shared/src/schemas/user.ts — `email`, `givenName`, `familyName` shapes

files-write:

- packages/shared/src/schemas/group.ts
- apps/api/src/admin/groups.ts
- apps/api/src/admin/__tests__/groups-membership.integration.spec.ts

interfaces:

- `GET /api/v1/groups/:id/members` — guard `user.read`, `{ members: [{ userId, email, givenName, familyName }] }`
- `POST /api/v1/groups/:id/members` — body `{ userId }`, guard `user.write`, `201 { userId, groupId }`
- `DELETE /api/v1/groups/:id/members/:userId` — guard `user.write`, `204`
- error codes `user_not_found`, `membership_exists`, `membership_not_found`

## Task

1. `packages/shared/src/schemas/group.ts`: add `groupMemberSchema` (`userId` UUID, `email`,
   `givenName`, `familyName`), `groupMemberListResponseSchema` (`{ members }`),
   `addGroupMemberRequestSchema` (`{ userId }`) and `groupMembershipSchema` (`{ userId, groupId }`)
   plus the exported types; a group keeps its UUID identity.
2. `apps/api/src/admin/groups.ts`: import `users` and register the three member routes of the
   interfaces above. Reads resolve `userGroups ⋈ users` ordered by `users.email`; a read of an
   unknown group answers `404 group_not_found`.
3. `POST` runs inside `database.transaction`: unknown group → `404 group_not_found`, unknown user
   → `404 user_not_found`, an existing membership row → `409 membership_exists` with
   `params: { fields: ['id', 'userId'] }`; otherwise one `userGroups` row is inserted and the
   membership is answered with `201`.
4. `DELETE /:id/members/:userId` removes exactly the one row (group and user), answers `404
   membership_not_found` when it is not a member and `204` after the deletion.
5. `apps/api/src/admin/__tests__/groups-membership.integration.spec.ts`: integration spec on a
   throwaway database (pattern of `roles.integration.spec.ts`) — anonymous `401`, office `403`,
   member list, add membership, duplicate `409`, unknown user `404`, remove `204` and the member
   count of `GET /api/v1/groups` follows the written rows.

## Non-goals

- No UI, no i18n keys (API errors stay `{ code, params }`).
- No migration: `groups` and `user_groups` exist in migration `0000_base_tables`.
- No group-based permissions and no on-call pool changes (ADR-0011 reads membership already).
- No `PATCH /api/v1/users/:id` group field; membership is edited on the group side only.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/api/src/admin/__tests__/groups-membership.integration.spec.ts
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M4-15b (`15b-groups-membership-ui.md`) and WP-M4-15c
  (`15c-groups-membership-users-ui.md`) — both files exist in this commit.
- Open question: none
