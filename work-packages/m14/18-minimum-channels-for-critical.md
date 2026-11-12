# WP-M14-18: The mandatory minimum channels of critical tickets

format: small-model
status: planned
depends-on: WP-M14-05, WP-M14-16
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.4, §11.9, §11.11; PLAN.md §12, §19
spec-lines: 40

files-read:

- specs/10-notifications.md §11.4, §11.9
- apps/api/src/notifications/outbox.ts (the enqueue and the worker)
- apps/api/src/notifications/config.ts (the channels of WP-M14-04)
- apps/api/src/settings/deadlines.ts (the pattern of a settings route)
- apps/web/src/admin/channels-page.tsx (the administration page)

files-write:

- apps/api/src/settings/notifications.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/admin/channels-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET/PUT /api/v1/settings/notifications/minimum-channels`
- `readMinimumChannels(database)`, `storeMinimumChannels(database, channels)`

## Task

1. The settings row `notifications.minimum_channels` holds the list of the
   channel kinds that every critical ticket is notified through; the route
   `GET/PUT /api/v1/settings/notifications/minimum-channels` answers and
   stores it behind `settings.read` and `settings.write`.
2. The list may only name channels that are configured; a channel that is not
   configured is refused with `422 invalid_request`, so the setting never
   promises a delivery that cannot happen.
3. The enqueue of the outbox adds the channels of the list to the rows of a
   critical ticket — whatever the selection of the user says; a channel that is
   already queued for the ticket is not queued twice.
4. The administration page of the channels shows the list and the checkboxes
   of the configured channels.

## Non-goals

- No change of the rules of the escalation — they keep their own channel list.
- No change of the retry and of the fallback.
- No warning on a failed channel — that is WP-M14-19.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the setting is read and written, an unconfigured channel
is refused and a critical ticket queues the mandatory channels.

## Handoff

- Files changed: the new settings module, the enqueue, the administration page,
  the two locale files and the tests
- Interfaces added: the route of the minimum channels
- Verified: `npm run check`
- Follow-up WP: WP-M14-19 — the warning on a failed channel
- Open question: none
