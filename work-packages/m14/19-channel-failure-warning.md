# WP-M14-19: The warning on a failed channel

format: small-model
status: planned
depends-on: WP-M14-05
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.8, §11.11, §11.12; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.8, §11.12
- apps/api/src/dashboard/service.ts (the channel status of today)
- apps/api/src/notifications/routes.ts (the routes of the phase)
- apps/web/src/admin/channels-page.tsx (the administration page)
- apps/web/src/settings/settings-page.tsx (the menu)

files-write:

- apps/api/src/notifications/routes.ts
- apps/web/src/admin/channels-page.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `GET /api/v1/notifications/status` — the status of every channel
- the badge of the settings menu of an administrator

## Task

1. The route `GET /api/v1/notifications/status` answers for every channel the
   pending rows, the failed rows, the time of the last success and the time of
   the last failure; it reads the same rows as the dashboard tile of §11.8.
2. The administration page of the channels lists the failing channels with the
   time of the last failure and the number of the failed rows.
3. The settings menu of an administrator shows a badge with the number of the
   failing channels, as long as a channel fails; the badge disappears when
   every channel works again.
4. The texts are added in `de` and `en`; the badge is not the only carrier of
   the warning — the tile of the dashboard and the ticket history keep it.

## Non-goals

- No e-mail or push about the warning itself — that would be a notification
  about a notification.
- No change of the worker, of the retries or of the fallback.
- No history of the failures beyond the rows of the outbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a failed channel is visible in the page, in the menu and
in the status of the API, and the badge disappears after a success.

## Handoff

- Files changed: the routes, the administration page, the settings menu, the
  two locale files and the tests
- Interfaces added: the route of the channel status
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-20 — the notifications of the internal ticket creation
- Open question: none
