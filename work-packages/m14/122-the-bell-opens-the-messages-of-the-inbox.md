# WP-M14-122: the bell opens the messages of the inbox

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.8, §11.12; PLAN.md §12, §14
spec-lines: 20

depends-on: WP-M14-120e, WP-M14-120d

files-read:

- apps/web/src/components/Shell.tsx (the bell of WP-M14-120e)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox of WP-M14-120d)
- apps/web/src/i18n/locales/{de,en}/common.json (the texts of the inbox)

files-write:

- apps/web/src/components/notification-bell.tsx, apps/web/src/components/__tests__/notification-bell.test.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `NotificationBell` — the bell of the header with the badge of the unread
  messages and the panel of the latest messages.
- The panel lists the latest messages of `GET /api/v1/notifications/messages`,
  marks a message as read through `PATCH /api/v1/notifications/messages/:id/read`
  and links to the full inbox `/notifications`.

## Task

1. Move the bell of `Shell.tsx` into its own module
   `apps/web/src/components/notification-bell.tsx` and turn it into a real
   notification centre: a click on the bell opens a panel with the latest
   messages of the inbox — title, channel, state and moment — the unread ones
   marked, a failed one standing out.
2. A click on a message in the panel marks it as read without leaving the
   panel; the badge of the bell and the list refresh.
3. The panel carries a link to the full inbox `/notifications` and closes when
   the click lands outside of it or when the escape key is pressed.
4. The bell stays hidden without a session, and the panel never shows a
   contact of a reporter and never a photo (§11.5).
5. Add the texts of the panel in `de` and `en` and prove the bell in the test of
   the component.

## Non-goals

- No change of the API of the inbox (WP-M14-120c).
- No push notification of the browser — the Web Push channel of §11.1 delivers
  the message itself.
- No deletion of messages and no filter of the state.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the bell opens the panel with the messages and a click on
a message marks it as read.

## Handoff

- Files changed: the bell module, the shell, the two locale files and the test
- Interfaces added: the panel of the bell
- Verified: `npm run check`, `npm run build`
- Follow-up WP: none
- Open question: none
