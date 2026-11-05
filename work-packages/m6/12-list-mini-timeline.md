# WP-M6-12: list mini timeline and remaining time

format: small-model
status: planned
depends-on: WP-M6-10
phase: 6
milestone: m6
context-budget: 16k tokens
spec: specs/05-timeline.md §5.4; PLAN.md §9 (lists show a mini timeline)
spec-lines: 20

files-read:

- specs/05-timeline.md §5.4
- apps/web/src/features/tickets/ticket-list-page.tsx
- packages/shared/src/timeline.ts (state colours)
- apps/web/src/i18n/locales/de/ticket.json (list namespace)

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- each list row renders a small bar from `percent` and `timelineState`
- the deadline column shows remaining time or overdue time
- i18n keys `list.remaining.*` (de + en)

## Task

1. Render the mini bar in the row from the API fields of WP-M6-10.
2. Replace the absolute deadline text with the remaining/overdue label; keep
   the absolute time as a `title` attribute.
3. Add de/en keys; no literal JSX text.
4. Extend the list page test with an overdue and a green row.

## Non-goals

- No new sort control; `deadlineAt` already sorts by least remaining time.
- No pause detail in the list.
- No detail page change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: list page, de/en locale, list test
- Interfaces added: `list.remaining.*`
- Verified: typecheck, lint, test:run, i18n:check
- Follow-up WP: WP-M6-13 (exit criterion)
- Open question: none
