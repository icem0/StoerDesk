# WP-M14-121: the test of the own topic needs a route of the own user

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/10-notifications.md §11.11, §11.12; PLAN.md §12
spec-lines: 15

depends-on: WP-M14-119, WP-M14-120c

files-read:

- apps/api/src/notifications/routes.ts (the test route of the administration)
- apps/web/src/settings/notifications-page.tsx (the test button of the own topic)

files-write:

- apps/api/src/notifications/routes.ts, apps/api/src/notifications/__tests__/messages-routes.integration.spec.ts
- apps/web/src/settings/notifications-page.tsx, apps/web/src/settings/__tests__/notifications-page.test.tsx

interfaces:

- `POST /api/v1/notifications/accounts/ntfy/test` — sends a test message to the
  own topic of the session user; the answer carries `delivered` and the
  machine code of a failure.

## Task

1. The test button of the own topic on `/settings/notifications` calls the
   administration route `POST /v1/admin/channels/ntfy/test` today. That route
   needs the permission `notification.write`, so a user without that permission
   cannot test the own subscription — the button answers `403`.
2. Add the route `POST /api/v1/notifications/accounts/ntfy/test` behind the
   session: it sends the test message to the stored topic of the user of the
   session and answers `delivered` with the machine code of a failure.
3. The button of the own topic calls the new route.

## Non-goals

- No change of the test route of the administration.
- No new permission key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a user without `notification.write` can test the own
subscription.

## Handoff

- Files changed: the routes, the settings page and their tests
- Interfaces added: `POST /api/v1/notifications/accounts/ntfy/test`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: none
- Open question: none
