# WP-M30-04: the inbox shows the tasks

format: ctx-256k
status: done
depends-on: WP-M30-03
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.11, §11.12, §11.16, §11.18
spec-lines: 130
changed-lines: 753

files-read:

- specs/10-notifications.md §11.11 (the API), §11.12 (the UI), §11.18 (the task of the user)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox as it is now — a log of the deliveries)
- apps/web/src/components/notification-bell.tsx, apps/web/src/components/alarm-banner.tsx (the two readers of the count)
- apps/api/src/notifications/routes.ts (the routes of the messages and of the tasks)
- apps/api/src/notifications/messages.ts (the reading of the messages — it leaves the API)
- packages/shared/src/schemas/notification.ts (the contracts of the messages)

files-write:

- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/components/notification-bell.tsx, apps/web/src/components/alarm-banner.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/api/src/notifications/routes.ts, apps/api/src/notifications/messages.ts
- packages/shared/src/schemas/notification.ts
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- apps/web/src/components/__tests__/alarm-banner.test.tsx, apps/web/src/components/__tests__/shell.test.tsx
- packages/shared/src/__tests__/notification.test.ts
- apps/api/src/notifications/__tests__/messages-routes.integration.spec.ts — deleted: the routes it proved leave the API
- docs/REPO-MAP.md, CHANGELOG.md
- work-packages/m30/04-the-inbox-shows-the-tasks.md

interfaces:

- `GET /api/v1/notifications/items` — the tasks of the signed-in user (§11.18)
- `GET /api/v1/notifications/items/unread-count` — the count of the unhandled tasks (the bell and the band)
- `PATCH /api/v1/notifications/items/:id/read` — the read receipt of one own task
- the three routes of the messages **leave** the API

## Task

The inbox of a user is a **log of the deliveries** today: every row is one
delivery attempt with its channel and its state, and the same event stands
there three times when the user has three confirmed channels. The office asks
for the other half of the truth: **what StörDesk has to tell me** — one entry
per task, with the readable text, the link to the place of the action and the
time of the task. The way of a message belongs to the protocol of the
administration (§11.16), not to the inbox (§11.18, ADR-0052).

1. **The page** `apps/web/src/features/notifications/inbox-page.tsx`: the list
   reads `GET /api/v1/notifications/items` and shows one row per task — the
   **readable text** composed from the event type and the params of the task,
   the **link** into the ticket or into the readiness, the time of the task and
   the read receipt of the user. The admin filter (the recipient, the channel,
   the event, the state) leaves the page with the protocol; the filter of the
   unhandled tasks stays and lives in the URL. The hint of the web push stands
   above the list (WP-M14-143).
2. **The texts** in `de/common.json` and `en/common.json`: one sentence per
   event type under `inbox.task.*` — „Meldung ST-0001 ist dir zugewiesen.“,
   „Meldung ST-0001: Musterfrau Meierin hat angenommen.“, „Die Bereitschaft
   Nord ist dir zugeteilt.“ — and the texts of the page itself. The interface
   composes them; the API stores no translated text (§3.1).
3. **The bell** `apps/web/src/components/notification-bell.tsx` and **the band**
   `apps/web/src/components/alarm-banner.tsx`: both read the count of the
   unhandled tasks. The band of the alarm counts the things to do and not the
   attempts (§11.17) — one task over three channels sounds once.
4. **The API** `apps/api/src/notifications/routes.ts`: the three routes of the
   messages leave — `GET /api/v1/notifications/messages`,
   `GET /api/v1/notifications/messages/unread-count` and
   `PATCH /api/v1/notifications/messages/:id/read`. The rows of the messages
   stay — they are the protocol (§11.16).
5. **The reading** `apps/api/src/notifications/messages.ts`: `readMessages` and
   `readRecipients` leave with their routes; the protocol of §11.16 stays.
6. **The contracts** `packages/shared/src/schemas/notification.ts`: the schemas
   of the messages leave with their routes — the item, the attempt and the
   count of the tasks stay.
7. **The tests**: the test of the page is new — it proves the readable text,
   the link into the ticket and into the calendar, the receipt of a task, the
   empty state and that the page names **neither** a channel nor a delivery
   state; the tests of the bell, of the band and of the shell read the new
   count; the test of the contracts proves the item and the attempt.

## Non-goals

- No state „handled“ — that belongs to the settings of the workflow
  (ADR-0052 decision 6).
- No change of the protocol — it is read on `/admin/delivery` (WP-M30-03).
- No change of the push of the browser and of the sound of the installation.
- No change of the emergency rule of `PLAN.md` §2 — nothing of the page
  touches the report path of the customers.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the page proves that the inbox names neither
a channel nor a delivery state.

## Handoff

- Files changed: the page of the inbox, the bell, the band, the two locales,
  the routes, the reading, the contracts, the test of the page, the tests of the
  bell, of the band and of the shell, the test of the contracts, the deleted
  test of the old routes, the module map and the changelog
- Interfaces added: none — the three routes of the tasks of WP-M30-02 carry the
  page now; the three routes of the messages leave the API
- Verified: `npm run check` green (wp:check 829/0, eslint 0 errors, vitest 285
  files / 2021 tests, Playwright 15/15)
- Follow-up WP: WP-M30-05 — the alarm of a failed delivery
- Open question: none
