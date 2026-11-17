# WP-M14-120c: the API of the notification inbox

format: small-model
status: planned
depends-on: WP-M14-120b
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.8, §11.11, §11.13; PLAN.md §12
spec-lines: 20

files-read:

- apps/api/src/notifications/routes.ts (the notification routes)
- packages/shared/src/schemas/notification.ts (the contracts of WP-M14-120a)

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/messages-routes.integration.spec.ts

interfaces:

- `GET /api/v1/notifications/messages` — the own messages of the session user,
  newest first, `limit` (default 50, max 200) and `offset`.
- `PATCH /api/v1/notifications/messages/:id/read` — marks one own message as
  read; the answer carries the id and the moment of the receipt.
- `GET /api/v1/notifications/messages/unread-count` — the number of the unread
  messages of the session user for the bell of the shell.

## Task

1. Answer `GET /api/v1/notifications/messages` behind the session: the rows of
   the user, ordered by `created_at` descending, with `state`, `channel`,
   `eventType`, `title`, `body`, `createdAt` and `readAt`. The `limit` and the
   `offset` are read as numbers and fall back to the defaults when they are not
   a number.
2. Answer `PATCH /api/v1/notifications/messages/:id/read` behind the session: it
   marks a message of the session user as read; a message of another user or an
   unknown id answers `404 message_not_found`.
3. Answer `GET /api/v1/notifications/messages/unread-count` behind the session:
   the number of the messages of the user with an empty `read_at`.
4. Prove it in an integration test: a message row of the user is answered, the
   message of another user is not, the read receipt sets `read_at` and the
   unread count drops.

## Non-goals

- No user interface — that is WP-M14-120d.
- No permission key: the session is enough, the code is bound to the user of
  that session.
- No deletion of messages and no filter of the state.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the route answers the own messages and the read receipt
works.

## Handoff

- Files changed: the routes and the integration test of the inbox
- Interfaces added: the two routes and the unread count
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120d — the inbox page and the bell
- Open question: none
