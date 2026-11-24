# WP-M25-08: the pushed alarm asks the page for the sound

format: small-model
status: done
depends-on: WP-M25-06
phase: 25
milestone: m25
context-budget: 12k tokens
spec: specs/10-notifications.md §11.17
spec-lines: 20

files-read:

- apps/web/src/sw.ts (the push handler of the service worker)
- apps/web/src/components/alarm-banner.tsx (the band of the alarm)

files-write:

- apps/web/src/sw.ts
- apps/web/src/components/alarm-banner.tsx

interfaces:

- `requestAlarmTone(clients)` — asks every open page for the sound of the alarm
- the message `PLAY_ALARM_TONE` — from the service worker to the pages

## Task

1. The service worker asks the open pages for the sound after a push: a
   service worker has no Web Audio, only a page may play a tone (§11.17,
   ADR-0048).
2. The band of the alarm listens for the message and plays the tone — with the
   rules of the installation: the sound is on, the user is not silent and the
   browser has the gesture.

## Non-goals

- No change of the band itself.
- No change of the routes.
- No sound without a page — the notification of the operating system stays the
  only alarm of a closed application.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the service worker, the band of the alarm
- Interfaces added: the message of the sound
- Verified: the commands above
- Follow-up WP: none
- Open question: none
