# WP-M25-02: the shared contracts of the alarm and of the mute

format: small-model
status: done
depends-on: WP-M25-01
phase: 25
milestone: m25
context-budget: 12k tokens
spec: specs/10-notifications.md §11.17
spec-lines: 20

files-read:

- packages/shared/src/schemas/notification.ts (the contracts of the chapter)
- packages/shared/src/__tests__/notification.test.ts (the test of the contracts)

files-write:

- packages/shared/src/schemas/notification.ts
- packages/shared/src/__tests__/notification.test.ts

interfaces:

- `alarmSettingsSchema` — `{ toneEnabled: boolean, repeatSeconds: number }`
- `notificationMuteSchema` — `{ mutedUntil: string | null }`

## Task

1. Add the contract of the alarm of the installation: whether it alarms with a
   sound and the interval of the repetition (15 … 600 seconds).
2. Add the contract of the silence of a user: the end of the silence or `null`.
3. Write the test of both contracts — the bounds of the interval and the empty
   silence.

## Non-goals

- No route and no service in this WP.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test knows the bounds of the interval.

## Handoff

- Files changed: the shared schema, the test of the contracts
- Interfaces added: the two schemas
- Verified: the commands above
- Follow-up WP: WP-M25-03 — the route of the alarm of the installation
- Open question: none
