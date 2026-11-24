# WP-M25-04: the silence of one hour

format: small-model
status: done
depends-on: WP-M25-03
phase: 25
milestone: m25
context-budget: 14k tokens
spec: specs/10-notifications.md §11.17, §11.11
spec-lines: 20

files-read:

- apps/api/src/notifications/routes.ts (the routes of the layer)
- apps/api/src/settings/notifications.ts (the helpers of the settings rows)

files-write:

- apps/api/src/notifications/mute.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/mute.integration.spec.ts

interfaces:

- `GET /api/v1/notifications/mute` — the end of the silence of the signed-in user
- `POST /api/v1/notifications/mute` — the user is silent for one hour
- `readMuteUntil(database, userId)` — the end of the silence, `null` while the alarm is audible
- `muteForOneHour(database, userId)` — mutes the alarm for one hour

## Task

1. Write the silence of a user: the row `notifications.mute.<userId>` of the
   settings table holds the end of the silence — the silence follows the user
   and not the device. A silence in the past is no silence.
2. Add the two routes of §11.11 behind the session.
3. Write the test: an hour of silence, the read of the end, and a silence that
   is still running is not extended.

## Non-goals

- No UI — WP-M25-06.
- No change of the sound itself.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the hour and the row of the user.

## Handoff

- Files changed: the module of the silence, the routes, the test
- Interfaces added: the two routes of the silence
- Verified: the commands above
- Follow-up WP: WP-M25-05 — the administration of the alarm
- Open question: none
