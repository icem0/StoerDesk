# WP-M14-141b: the API of the filtered inbox

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.11, §11.16; PLAN.md §5, §12
spec-lines: 50

depends-on: WP-M14-141a

files-read:

- apps/api/src/notifications/routes.ts (the route of the message list)
- apps/api/src/auth/requirePermission.ts (the effective permissions of a request)
- apps/api/src/db/schema.ts (the tables `notification_messages` and `users`)
- packages/shared/src/schemas/notification.ts (the contracts of the messages)
- apps/api/src/notifications/**tests**/messages-routes.integration.spec.ts (the test of the routes)

files-write:

- apps/api/src/notifications/messages.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/**tests**/messages-routes.integration.spec.ts

interfaces:

- `readMessages(database, options)` — the messages of the filter, the newest
  first, with the addressee
- `readRecipients(database, options)` — the addressees of the filter with the
  number of their messages, without the filter of the addressee itself
- `GET /api/v1/notifications/messages` — the filters `userId`, `channel`,
  `eventType`, `state` and `unread`; a foreign `userId` without the permission
  answers `403 forbidden`, an unknown filter value answers
  `400 invalid_request`

## Task

1. `apps/api/src/notifications/messages.ts`: the query of the messages with the
   filters of the shared schema. The answer joins `users` for the name of the
   addressee (`given_name family_name`, else the e-mail) and carries the
   recipient of every row. A second query groups the rows by the addressee and
   counts them — it applies every filter **except** `userId`, so the list of the
   addressees stays complete while a filter is active.
2. `apps/api/src/notifications/routes.ts`: the route reads the effective
   permissions of the request. Without `notification.read_all` the answer stays
   the own messages — the recipient of a row is `null` and the list of the
   addressees is empty. A `userId` of another user without the permission
   answers `403 forbidden`; the own id is allowed.
3. The same route: an unknown value of a filter answers `400 invalid_request`
   with the field path, a value that is no uuid answers the same. The personal
   filters (`channel`, `eventType`, `state`, `unread`) narrow the own inbox and
   are allowed for every session.
4. The integration test: without the permission the answer holds the own
   messages only, a foreign `userId` answers `403 forbidden`; with the
   permission the answer holds the messages of every user, the recipient of a
   row names the addressee, the filter of the addressee and the filter of the
   channel narrow the answer, and the list of the addressees counts the
   messages.

## Non-goals

- No change of the unread count and of the read receipt: both stay bound to the
  session user.
- No deletion of a message and no export.
- No change of the delivery and no new event type.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/notifications/messages.ts`,
  `apps/api/src/notifications/routes.ts`, the integration test, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: `readMessages`, `readRecipients`, the filters of
  `GET /api/v1/notifications/messages`
- Verified: `npm run check`
- Follow-up WP: WP-M14-141c
- Open question: none
