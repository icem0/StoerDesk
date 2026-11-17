# WP-M14-120d: the inbox page

format: small-model
status: done
depends-on: WP-M14-120c
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.8, §11.12; PLAN.md §14
spec-lines: 20

files-read:

- apps/web/src/features/dashboard/start-page.tsx (a page of the internal area)
- apps/web/src/routes/index.tsx (the route table)
- apps/web/src/lib/api.ts (the API client)
- apps/web/src/i18n/locales/{de,en}/common.json (the texts of the shell area)

files-write:

- apps/web/src/features/notifications/inbox-page.tsx, apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `/notifications` — the inbox of the signed-in user: the messages of the own
  inbox, newest first, with the channel, the event, the state and the moment.
- `NotificationMessageListResponse` — the answer of the API of WP-M14-120c.

## Task

1. Add the page `/notifications` (`apps/web/src/features/notifications/inbox-page.tsx`):
   it reads `GET /api/v1/notifications/messages` and lists the messages of the
   own inbox, newest first. Every row shows the channel, the event, the state
   (`PENDING`, `SENT`, `FAILED`) and the moment of the message; the failed rows
   stand out and name the reason of the failure.
2. A click on a row marks the message as read through
   `PATCH /api/v1/notifications/messages/:id/read` and refreshes the list; the
   unread messages are marked in the list.
3. Register the route `/notifications` in `apps/web/src/routes/index.tsx` behind
   the session.
4. Add the localized texts of the inbox in `de` and `en`: the heading, the
   states, the empty state and the labels of the channel and of the event.

## Non-goals

- No bell in the shell — that is WP-M14-120e.
- No filter of the state and no deletion of messages.
- No change of the message content of §11.5.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the inbox lists the own messages and the read receipt
works.

## Handoff

- Files changed: the inbox page, the route table, the two locale files
- Interfaces added: the page `/notifications`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120e — the bell in the shell with the unread count
- Open question: none
