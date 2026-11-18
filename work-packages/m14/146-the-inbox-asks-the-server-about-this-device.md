# WP-M14-146: the inbox asks the server about this device

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/10-notifications.md §11.1, §11.12
spec-lines: 20

depends-on: WP-M14-143, WP-M14-144

files-read:

- apps/web/src/features/notifications/inbox-page.tsx (the inbox of WP-M14-143)
- apps/web/src/lib/web-push.ts (the probe of WP-M14-142)
- specs/10-notifications.md §11.12

files-write:

- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx

interfaces:

- `POST /v1/notifications/accounts/webpush/check` with `{ endpoint }` — the
  question of WP-M14-144
- `inbox.webpush.notRegistered` (de/en, added by WP-M14-146) — the line of a
  device the browser holds and the server does not know

## Task

**The last gap of the hint.** A browser whose device the server does not know
receives no push — and the inbox of WP-M14-143 stays silent, because the browser
itself holds a subscription.

1. The inbox asks the server about the endpoint of this browser and shows the
   hint also for the device the server does not know.
2. The hint names this case with its own text and links to the setup page,
   where the card registers the device again (WP-M14-145).

## Non-goals

- No change of the API of WP-M14-144.
- No change of the card.
- No change of the other texts of the hint.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the inbox names the device the server does not know.

## Handoff

- Files changed: the inbox page and its test
- Interfaces added: the text of the device the server does not know
- Verified: —
- Follow-up WP: none
- Open question: none
