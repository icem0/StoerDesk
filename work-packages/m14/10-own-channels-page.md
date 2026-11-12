# WP-M14-10: The own channels — the page and the Telegram section

format: small-model
status: planned
depends-on: WP-M14-09
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.12; PLAN.md §12, §14
spec-lines: 40

files-read:

- specs/10-notifications.md §11.3, §11.12
- apps/web/src/settings/my-settings-page.tsx (the pattern of a settings page)
- apps/web/src/settings/settings-page.tsx (the entries of the menu)
- apps/web/src/routes/index.tsx (the route table)
- apps/web/src/i18n/locales/de/common.json

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `NotificationsPage` — the own channels at `/settings/notifications`
- the entry `auth.links.notifications` of the settings menu

## Task

1. The page `/settings/notifications` lists the channels of §11.1 with the
   state of the linked account of the user; the sections of the other channels
   follow in the later packages.
2. The Telegram section asks the API for a code, shows it with the name of the
   bot, takes the code back, answers the linked chat id and offers to remove
   the account again.
3. The route `/settings/notifications` is registered behind `RequireSession`
   and the settings menu gets the entry "Benachrichtigungen" in the group
   "Persönlich".
4. The texts are added in `de` and `en`; the code is shown as text and never as
   an image with a secret.

## Non-goals

- No Matrix, no ntfy, no WhatsApp Web and no selection of the channels — the
  sections follow in WP-M14-12, WP-M14-13 and WP-M14-15.
- No change of the settings menu of the administration group.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page shows the Telegram section, asks for a code and
shows the linked account after the redemption.

## Handoff

- Files changed: the new page, the route table, the settings menu, the two
  locale files and the tests
- Interfaces added: `NotificationsPage`, the route `/settings/notifications`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-11 — the Matrix linking of the API
- Open question: none
