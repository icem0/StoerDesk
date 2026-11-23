# WP-M16-24d: the texts of the switch name the history

format: small-model
status: done
depends-on: WP-M16-24c
phase: 16
milestone: m16
context-budget: 12k tokens
spec: specs/13-ui.md §14.9
spec-lines: 20

files-read:

- apps/web/src/i18n/locales/de/common.json (the texts of the Darstellung)
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/branding-page.tsx (the switch of the direction)
- apps/web/src/settings/__tests__/branding-page.test.tsx

files-write:

- apps/web/src/i18n/locales/de/common.json and
  apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/branding-page.tsx
- apps/web/src/settings/__tests__/branding-page.test.tsx

interfaces:

- `branding.field.historySortDirection` — „Verlauf: Neuestes zuerst“ /
  „History: Newest first“
- `branding.hintHistorySortDirection` — the hint names the history of the ticket
  view and both states of the switch

## Task

1. `apps/web/src/i18n/locales/de/common.json` and
   `apps/web/src/i18n/locales/en/common.json` rename the keys
   `branding.field.ticketSortDirection` and `branding.hintTicketSortDirection`
   to `branding.field.historySortDirection` and
   `branding.hintHistorySortDirection` and give them the new texts: the field
   names the history, the hint says that the switch applies to the events of
   the history in the ticket view and names both of its states.
2. `apps/web/src/settings/branding-page.tsx` uses the renamed keys; the
   comment of the switch names the history of a ticket.
3. `apps/web/src/settings/__tests__/branding-page.test.tsx` proves the texts of
   the switch.

## Non-goals

- No change of the meaning of the switch: it steers the history of a ticket.
- No new text outside the `common` namespace and no change of the ticket texts.
- No change of the list: the list has its own order (WP-M16-24a, WP-M16-24b).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npx vitest run apps/web/src/settings/__tests__/branding-page.test.tsx
```

Expected: green; the renamed texts fail before the change and pass after it.

## Handoff

- Files changed: the two `common.json` locale files,
  `apps/web/src/settings/branding-page.tsx` and its test
- Interfaces added: the two renamed keys of the texts of the switch
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, the page
  test — the renamed texts fail before the change and pass after it
- Follow-up WP: none — this closes the chain of WP-M16-24
- Open question: none
