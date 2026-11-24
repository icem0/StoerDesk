# WP-M25-09: the settings page frees the tone of this browser

format: small-model
status: done
depends-on: WP-M25-07
phase: 25
milestone: m25
context-budget: 12k tokens
spec: specs/10-notifications.md §11.17
spec-lines: 20

files-read:

- apps/web/src/settings/settings-page.tsx (the overview of the settings)
- apps/web/src/components/alarm-banner.tsx (the band of the alarm)

files-write:

- apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `GET /api/v1/notifications/alarm` — the sound of the installation

## Task

1. The settings page carries the card **„Der Alarmton“** while the
   installation plays a tone and this browser has not allowed a tone yet: the
   button is the gesture a browser needs (ADR-0048). Without the card the
   browser would only learn about the gesture when the first alarm arrives.

## Non-goals

- No change of the band of the alarm.
- No change of the routes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the settings page, the labels
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none — phase 25 is closed
- Open question: none
