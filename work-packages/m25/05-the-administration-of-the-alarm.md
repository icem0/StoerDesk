# WP-M25-05: the administration of the alarm

format: small-model
status: done
depends-on: WP-M25-04
phase: 25
milestone: m25
context-budget: 12k tokens
spec: specs/10-notifications.md §11.12, §11.17
spec-lines: 20

files-read:

- apps/web/src/admin/channels-page.tsx (the administration of the channels)
- apps/api/src/settings/notifications.ts (the route of the alarm)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET|PUT /api/v1/settings/notifications/alarm` — the sound of the installation and the interval of its repetition

## Task

1. The channel page carries the section **„Der Alarm der Instanz“**: the
   switch „Die Instanz spielt den Alarmton" and the interval of the repetition
   in seconds — the administration decides whether the office alarms with a
   sound at all.
2. The hint names the rule of ADR-0048: the rhythm applies to the sound only,
   the visible alarm stays until the messages are read.

## Non-goals

- No change of the API — WP-M25-03.
- No band of the alarm — WP-M25-06.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the channel page, the labels
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M25-06 — the band of the alarm in the shell
- Open question: none
