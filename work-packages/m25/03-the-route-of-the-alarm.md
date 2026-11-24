# WP-M25-03: the route of the alarm of the installation

format: small-model
status: done
depends-on: WP-M25-02
phase: 25
milestone: m25
context-budget: 12k tokens
spec: specs/10-notifications.md §11.17, §11.11
spec-lines: 20

files-read:

- apps/api/src/settings/notifications.ts (the routes of the notification settings)
- apps/api/src/settings/__tests__/notifications.integration.spec.ts (the test of the routes)

files-write:

- apps/api/src/settings/notifications.ts
- apps/api/src/settings/__tests__/notifications.integration.spec.ts

interfaces:

- `GET /api/v1/settings/notifications/alarm` — the sound of the installation and the interval of its repetition
- `PUT /api/v1/settings/notifications/alarm` — replaces them
- `notifications.alarm_tone_enabled` — the settings row of the sound
- `notifications.alarm_repeat_seconds` — the settings row of the interval

## Task

1. Write the route of the alarm: `GET` and `PUT
   /api/v1/settings/notifications/alarm` behind `settings.read` and
   `settings.write` with the two settings rows. The defaults are the sound
   **on** and the interval of **60 seconds** — an installation without the rows
   alarms anyway.
2. Refuse an interval below 15 seconds and above 600 seconds with
   `400 invalid_request`.
3. Write the test of the route.

## Non-goals

- No UI — WP-M25-05.
- No mute — WP-M25-04.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the defaults and the bounds of the
interval.

## Handoff

- Files changed: the route, the test
- Interfaces added: the two routes of the alarm, the two settings rows
- Verified: the commands above
- Follow-up WP: WP-M25-04 — the silence of one hour
- Open question: none
