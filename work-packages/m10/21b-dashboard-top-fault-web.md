# WP-M10-21b: dashboard start page shows the most frequent fault

format: small-model
status: done
depends-on: WP-M10-21, WP-M10-20, WP-M10-19b
phase: 10
milestone: m10
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.2; specs/06-report-form.md §7.9
spec-lines: 30

files-read:

- apps/web/src/features/dashboard/start-page.tsx (the start page)
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx (the page test)
- apps/web/src/features/tickets/use-fault-catalog.ts (the localized fault catalog by key)
- packages/shared/src/schemas/dashboard.ts (the snapshot's `topFault` block, WP-M10-21)
- apps/web/src/i18n/locales/de/ticket.json (the `dashboard.*` keys)

files-write:

- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- the `dashboard.topFault` panel on the start page, reading the snapshot's `topFault` block
- i18n keys `dashboard.topFault.title` and `dashboard.topFault.count` (`de`, `en`)

## Task

1. Read `snapshot.topFault` and resolve its localized label from the fault catalog
   (`useFaultCatalog(locale)`, the same catalog the report and office forms use, WP-M10-20):
   the fault `key` maps to its translated `text`; an unknown key falls back to the key.
2. Render a panel between the tiles and the on-call tile: the `dashboard.topFault.title`
   heading, the localized fault text and `dashboard.topFault.count` with the ticket count.
   The panel stays hidden while `topFault` is `null` or absent (an older snapshot).
3. Add the `dashboard.topFault.title`/`count` keys to `de` and `en`.
4. Extend the page test: the stub answers a catalog with the fault key and the snapshot
   carries `{ key: 'feueralarm_ausloesung', count: 3 }`, the page shows the localized label
   and the count; a snapshot without `topFault` shows no panel.

## Non-goals

- No snapshot or service change (the block exists since WP-M10-21).
- No fault-catalog ordering change (WP-M10-20) and no statistics page change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the extended page test fails against the un-rendered panel and passes after.

## Handoff

- Files changed: the start page, its test and the two ticket-namespace locale files
- Interfaces added: the start-page top-fault panel and the `dashboard.topFault.*` keys
- Verified: typecheck, lint, test:run (page), i18n:check, wp:check
- Follow-up WP: none
- Open question: none
