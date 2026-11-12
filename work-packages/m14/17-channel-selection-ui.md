# WP-M14-17: The selection of the channels per event type in the settings page

format: small-model
status: planned
depends-on: WP-M14-16
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.4, §11.12; PLAN.md §12
spec-lines: 30

files-read:

- specs/10-notifications.md §11.4, §11.12
- apps/web/src/settings/notifications-page.tsx (the own channels page)
- apps/web/src/i18n/locales/de/common.json

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- the section `notifications.selection.*` of the own channels page

## Task

1. The own channels page shows one row per event type of §11.4 with the
   channels as checkboxes; a channel that is not configured is not offered and
   a channel without a linked account of the user is marked as such.
2. The selection is saved with one `PUT /api/v1/notifications/preferences` and
   the page shows the saved state; an error of the API is shown as a text.
3. The hint of the section names the rule of the precedence: the escalation
   rule of the admin decides the channels of an escalation, the mandatory
   minimum channels of a critical ticket are added to every event.
4. The texts are added in `de` and `en`.

## Non-goals

- No administration of the mandatory minimum channels — that is WP-M14-18.
- No change of the API of WP-M14-16.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page reads the selection, saves it and shows the rule
of the precedence.

## Handoff

- Files changed: the own channels page, the two locale files and the tests
- Interfaces added: the section of the selection
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-18 — the mandatory minimum channels of critical tickets
- Open question: none
