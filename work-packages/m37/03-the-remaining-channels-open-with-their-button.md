# WP-M37-03: the remaining channels open with their button

format: ctx-256k
status: done
depends-on: WP-M37-02
phase: 37
milestone: m37
context-budget: 44k tokens
spec: specs/10-notifications.md §11.19, §11.3, §11.3a, §11.6, §11.12; PLAN.md §14, §16
spec-lines: 150
changed-lines: 560

files-read:

- specs/10-notifications.md §11.19 (the overview of the own channels)
- apps/web/src/settings/notifications-page.tsx (the own page of the channels)
- apps/web/src/features/settings/WebPushSubscription.tsx (the card of the web push)
- apps/web/src/i18n/locales/de/common.json (the texts of the notifications)

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/settings/__tests__/notifications-page.test.tsx

interfaces:

- the panel of a channel (`channel-panel-<kind>`) — the setup of the channel; the row of the channel in the overview carries the button that opens it (§11.19)

## Task

WP-M37-02 opened the **ntfy** channel and the confirmation of the code. The
remaining channels still stood at once on the page — the code of the Telegram
bot, the form of Matrix, the address of the e-mail, the card of the web push
and the chats of the WhatsApp bridge. This package gives them the same
behaviour: the setup of a channel appears when its channel is open and only
then.

1. `apps/web/src/settings/notifications-page.tsx`: the section of **Telegram**,
   of **Matrix**, of the **e-mail** and of **WhatsApp Web** and the card of the
   **web push** render only while their channel is open. The panel of every
   channel carries the id `channel-panel-<kind>`, which the button of its row
   names with `aria-controls`.
2. The data of a channel is read while its channel is open: the one-time code
   of the Telegram bot and the chats of the WhatsApp bridge are asked for then
   — a page view never burns a code nobody uses and never asks the bridge for
   its chats.
3. The web-push card is wrapped in the panel of its channel, so the button of
   the row of the web push opens the card of the browser.
4. The test of the page opens a channel before it reads its setup — for
   Telegram, Matrix, the e-mail, the web push and WhatsApp Web.

## Non-goals

- The overview and the rule of the administration (WP-M37-01) stay as they are.
- The setup of a channel is not changed — only when it appears.
- No new channel, no new text of a channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/settings/notifications-page.tsx`, the test of the page
- Interfaces added: the panel of every channel (`channel-panel-<kind>`)
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the cases of the page run green
- Follow-up WP: none
- Open question: none
