# WP-M14-127: the bell opens the inbox page in one click

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.8, §11.12; PLAN.md §12, §14
spec-lines: 16

depends-on: WP-M14-122, WP-M14-120e

files-read:

- apps/web/src/components/notification-bell.tsx (the bell with the panel of WP-M14-122)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox page of WP-M14-120d)
- apps/web/src/components/Shell.tsx (the mount of the bell)
- apps/web/src/i18n/locales/de/common.json (the inbox texts)

files-write:

- apps/web/src/components/notification-bell.tsx, apps/web/src/components/__tests__/notification-bell.test.tsx

interfaces:

- `NotificationBell` — the bell of the header: the badge of the unread messages
  and one link that opens the inbox page `/notifications` in one click.
- The panel, its message query, the mark-read mutation of the panel and the
  close-on-escape rule are gone; marking a message as read belongs to the inbox
  page of WP-M14-120d.

## Task

**The comment of the office (out of band in phase 14).** „Mit einem Klick auf
die Glocke soll sofort die Seite Notifikations öffnen — lösche das Pulldown
Menu.“ The panel of WP-M14-122 repeats the inbox inside the header; the office
wants the page itself.

1. The bell becomes one `Link to="/notifications"`: a click opens the inbox
   page immediately and leaves the header.
2. The unread badge of WP-M14-120e stays: `GET /v1/notifications/messages/unread-count`
   with its refetch on window focus.
3. Delete the panel, its message query (`?limit=5`), the mark-read mutation,
   the click-outside and escape handling and the `MessageEntry` helper. A
   message is marked as read on the inbox page only.
4. The bell stays hidden without a session (the shell keeps the guard).
5. The test proves the badge, the missing badge at zero and the link to
   `/notifications`; no message text renders before a click.

## Non-goals

- No change of the inbox page, of the API of the inbox (WP-M14-120c) or of the
  texts of the inbox.
- No web push (WP-M14-124 … WP-M14-126b) and no setup link — that is
  **WP-M14-128**.
- No filter, no deletion of messages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the bell carries the unread badge and is one link to the
inbox page.

## Handoff

- Files changed: the bell module, its test and this WP
- Interfaces added: the bell as one link to the inbox page
- Verified: `npx vitest run apps/web/src/components/__tests__/notification-bell.test.tsx`,
  `npm run check`
- Follow-up WP: WP-M14-128 (the inbox names the setup page when web push is not
  set up)
- Open question: none
