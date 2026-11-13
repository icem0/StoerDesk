# WP-M14-16: The selection of the channels per event type — the API

format: small-model
status: planned
depends-on: WP-M14-04
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.4, §11.11; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.4, §11.11
- apps/api/src/notifications/accounts.ts (the service of WP-M14-08)
- apps/api/src/notifications/config.ts (the channels of WP-M14-04)
- apps/api/src/notifications/routes.ts (the routes of the phase)
- apps/api/src/db/schema.ts (the table of WP-M14-04)

files-write:

- apps/api/src/notifications/preferences.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `GET /api/v1/notifications/preferences` — the own selection
- `PUT /api/v1/notifications/preferences` — the own selection
- `readPreferences(database, userId)`, `writePreferences(database, userId, selection)`

## Task

1. `apps/api/src/notifications/preferences.ts` reads and writes the selection of
   a user: one row per user, event type and channel in
   `notification_preferences`.
2. The routes `GET` and `PUT /api/v1/notifications/preferences` answer the
   selection of the session; the event types are the seven of §11.4 (ADR-0021) and the
   channels are the kinds of §11.1 — a value outside of them is refused with
   `422 invalid_request`.
3. The shared contracts name the event types and the selection.
4. A unit test proves that a selection replaces the rows of the user and that
   the selection of another user is never touched.

## Non-goals

- No page — the selection in the settings page is WP-M14-17.
- No change of the enqueue: the selection is read when the outbox rows are
  written — that is WP-M14-18.
- No group of channels, no wildcard.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the selection of a user is written, read and replaced and
an unknown event type is refused.

## Handoff

- Files changed: the new preference service, the routes, the shared contracts
  and the tests
- Interfaces added: the two routes of the selection
- Verified: `npm run check`
- Follow-up WP: WP-M14-17 — the selection in the settings page
- Open question: none
