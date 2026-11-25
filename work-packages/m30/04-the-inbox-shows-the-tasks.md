# WP-M30-04: the inbox shows the tasks

format: ctx-256k
status: planned
depends-on: WP-M30-03
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.11, §11.12, §11.16, §11.17, §11.18
spec-lines: 140
changed-lines: 560

files-read:

- specs/10-notifications.md §11.12 (the UI), §11.16 (the protocol), §11.18 (the task)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox as it is now)
- apps/web/src/components/notification-bell.tsx (the bell of the shell)
- apps/web/src/components/alarm-banner.tsx (the band of the alarm)
- apps/web/src/lib/web-push.ts, apps/web/src/lib/alarm-tone.ts (the helpers of the page)
- apps/web/src/i18n/locales/de/common.json (the namespace of the inbox)
- apps/api/src/notifications/routes.ts (the routes of the session)

files-write:

- apps/api/src/notifications/routes.ts
- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/components/notification-bell.tsx
- apps/web/src/components/alarm-banner.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `GET /api/v1/notifications/items/unread-count` — the count of the unhandled tasks (the bell and the band)
- `PATCH /api/v1/notifications/items/:id/read` — the read receipt of one own task
- the three routes of the messages **leave** the API

## Task

1. **The routes** `apps/api/src/notifications/routes.ts`: the three routes of
   the messages leave the API — `GET /api/v1/notifications/messages`,
   `GET /api/v1/notifications/messages/unread-count` and
   `PATCH /api/v1/notifications/messages/:id/read` — and the count of the
   tasks takes their place. The tests of the old routes are adapted in the
   same commit; no test of the behaviour is dropped.
2. **The inbox** `apps/web/src/features/notifications/inbox-page.tsx`: the page
   reads the tasks and shows one row per task — the **readable text** composed
   from the event type and the params in the language of the interface, the
   deep link into the ticket or into the readiness, the time and the read
   receipt. The channel and the delivery state leave the page: they belong to
   the protocol (WP-M30-03). The filter of the addressee leaves the page with
   the admin filter — the right `notification.read_all` guards the protocol
   now.
3. **The bell** `apps/web/src/components/notification-bell.tsx` and **the band**
   `apps/web/src/components/alarm-banner.tsx`: both read the count of the
   tasks. The band of the alarm counts the things to do and not the attempts
   (§11.17, ADR-0048) — one task over three channels sounds once.
4. **The texts** in `de/common.json` and `en/common.json`: one text per event
   type of a task and the texts of the page. The texts of the reasons of a
   failure stay in the namespace of the delivery page.
5. **The tests**: the test of the inbox proves that a task of a ticket links
   into the ticket, that the read receipt of a task works and that no channel
   is named in the page; the test of the bell and the test of the band read
   the new count.

## Non-goals

- No change of the protocol — it is read on its own page (WP-M30-03).
- No state „handled“ and no workflow settings — the task knows only
  „unread“ and „read“ (ADR-0052 decision 6).
- No change of the warning of the setup and of the mute of the user.
- No change of the push of the browser.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the tests of the inbox, of the bell and of the band read
the count of the tasks.

## Handoff

- Files changed: the routes, the inbox, the bell, the band and the two locales
- Interfaces added: none new — the routes of the tasks of WP-M30-02 carry the
  page now
- Verified: the commands above
- Follow-up WP: WP-M30-05 — the alarm of a failed delivery
- Open question: none
