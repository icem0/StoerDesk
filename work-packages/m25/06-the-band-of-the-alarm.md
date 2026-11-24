# WP-M25-06: the band of the alarm in the shell

format: small-model
status: done
depends-on: WP-M25-05
phase: 25
milestone: m25
context-budget: 18k tokens
spec: specs/10-notifications.md §11.12, §11.17
spec-lines: 40

files-read:

- apps/web/src/components/Shell.tsx (the shell of the app)
- apps/web/src/components/notification-bell.tsx (the bell of the menu)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox with the old switch)
- apps/web/src/lib/alarm-tone.ts (the tone of the browser)

files-write:

- apps/web/src/components/alarm-banner.tsx, apps/web/src/components/Shell.tsx
- apps/web/src/components/notification-bell.tsx, apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/components/__tests__/alarm-banner.test.tsx, apps/web/src/components/__tests__/notification-bell.test.tsx

interfaces:

- `GET /api/v1/notifications/alarm` — the sound of the installation and the interval of its repetition
- `GET|POST /api/v1/notifications/mute` — the silence of the user
- `AlarmBanner` — the band of the alarm in the shell

## Task

1. Write the band of the alarm (`components/alarm-banner.tsx`) and mount it in
   the shell: it stands on every internal page while unhandled messages exist,
   shines and moves, and carries the button „1 Stunde stumm“ with the
   remaining time and the button „Ton aktivieren“ — the gesture a browser
   needs before it may play a sound at all.
2. The **sound** belongs to the installation: the band plays it at once when
   the alarm appears and again every `repeatSeconds` while the messages are
   unhandled. The **interval governs the sound only** — the band is a state, not
   a repetition (§11.17, ADR-0048).
3. The **silence** belongs to the user: the button writes the end of the
   silence on the server, so it follows the user and not the device; it
   silences the sound only.
4. The bell of the menu **shines and moves** while messages are unhandled and
   never plays the tone itself; the switch of the tone leaves the inbox page.

## Non-goals

- No warning of the setup — WP-M25-07.
- No pushed alarm — WP-M25-08.
- No change of the sound itself.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the band proves that it stands, that it
silences for an hour and that a silent instance says so.

## Handoff

- Files changed: the band, the shell, the bell, the inbox page, the tests
- Interfaces added: the component of the band, the route of the alarm for the
  session
- Verified: the commands above
- Follow-up WP: WP-M25-07 — the warning of the setup on every page
- Open question: none
