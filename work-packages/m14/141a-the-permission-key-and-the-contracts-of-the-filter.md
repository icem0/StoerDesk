# WP-M14-141a: the permission key and the contracts of the filter

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.3, §3.4; specs/10-notifications.md §11.16; PLAN.md §5
spec-lines: 40

depends-on: WP-M14-141

files-read:

- packages/shared/src/permissions.ts (the catalog of the permission keys)
- packages/shared/src/schemas/notification.ts (the contracts of the messages)
- specs/01-rbac.md §3.3 (the role–permission matrix)
- apps/api/src/db/seed-rbac.ts (the seed writes the catalog into the table)

files-write:

- packages/shared/src/permissions.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `PERMISSIONS.notification.readAll` — the value `notification.read_all`
- `notificationMessageFilterSchema` — `{ userId?, channel?, eventType?, state?,
unread? }`, the filter of the message list
- `notificationMessageRecipientSchema` — `{ userId, name }`
- `notificationRecipientSummarySchema` — `{ userId, name, count }`
- `notificationMessageItemSchema` — gains `recipient` (`null` without the
  permission)
- `notificationMessageListResponseSchema` — gains `recipients`

## Task

The catalogue of §3.4 of `specs/01-rbac.md` is the only place where a
permission key is added, and the seed writes every key of the catalogue into the
table `permissions` — a new key needs no migration.

1. `packages/shared/src/permissions.ts`: the category `notification` gains
   `readAll: 'notification.read_all'`, `PERMISSION_KEYS` gains the key after
   `notification.write`. The key belongs to **no** default role: the office
   assigns it to a role over the role API (§3.8). `admin` holds it through
   `DEFAULT_ROLES.admin`, which is the whole catalogue.
2. `packages/shared/src/schemas/notification.ts`: the filter schema binds
   `userId` to a uuid, `channel` to `notificationChannelKindSchema`,
   `eventType` to `notificationEventTypeSchema`, `state` to the three states of
   the delivery and `unread` to a boolean.
3. The same file: `notificationMessageItemSchema` gains the optional recipient
   (`null` without the permission), `notificationMessageListResponseSchema`
   gains the list of the addressees with the number of their messages. Both
   lists stay empty in the personal answer, so a client without the permission
   reads the same shape.

## Non-goals

- No route and no UI: the filter is read in WP-M14-141b and shown in
  WP-M14-141c.
- No change of the other permission keys and no change of `DEFAULT_ROLES` of the
  four other system roles.
- No new migration: the seed writes the new key into the table `permissions`
  on the next start.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new key is in the catalogue and the new schemas parse
the filter and the answer of the inbox.

## Handoff

- Files changed: `packages/shared/src/permissions.ts`,
  `packages/shared/src/schemas/notification.ts`,
  `packages/shared/src/__tests__/notification.test.ts`,
  `packages/shared/src/__tests__/permissions.test.ts`, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: `notification.read_all`, `notificationMessageFilterSchema`,
  `notificationMessageRecipientSchema`, `notificationRecipientSummarySchema`
- Verified: `npm run check`
- Follow-up WP: WP-M14-141b, WP-M14-141c
- Open question: none
