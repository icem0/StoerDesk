# WP-M24-06e: the routes of the selection leave the API

format: small-model
status: planned
depends-on: WP-M24-06c
phase: 24
milestone: m24
context-budget: 10k tokens
spec: specs/10-notifications.md §11.4, §11.10, §11.11
spec-lines: 20

files-read:

- apps/api/src/notifications/routes.ts (the routes of the selection)
- apps/api/src/notifications/preferences.ts (the module of the selection)
- apps/api/src/db/schema.ts (the table of the selection)

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/preferences.ts
- apps/api/src/db/schema.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `GET /api/v1/notifications/preferences` — **removed**
- `PUT /api/v1/notifications/preferences` — **removed**
- `notification_preferences` — the table is dropped

## Task

1. Remove the two routes of the selection per event type and the module behind
   them.
2. Remove the table `notification_preferences` from the schema and drop it with
   the migration that follows the columns of WP-M24-02.
3. Remove the shared contracts of the selection.

## Non-goals

- No UI.
- No change of the delivery — WP-M24-06c.
- No change of the rules of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the table of the selection is gone.

## Handoff

- Files changed: the routes, the module of the selection, the schema, the
  shared contracts, the migration
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-08 — the code over the channel confirms the account
- Open question: none
