# WP-M2-40f: internal create and ticket detail read the live fault catalog

format: small-model
status: done
depends-on: WP-M2-40e
phase: 2
context-budget: 12k tokens
spec: specs/06-report-form.md §7.9, specs/02-data-model.md §4.5
spec-lines: 30

files-read:

- specs/06-report-form.md §7.9
- apps/web/src/features/tickets/internal-create-page.tsx — the checkbox list
- apps/web/src/features/tickets/ticket-detail-page.tsx — the fault labels
- apps/web/src/features/tickets/use-fault-catalog.ts — the hook of WP-M2-40e

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx

interfaces:

- the internal create form offers the **active** fault types only
- the ticket detail resolves every key of the ticket — also an archived one —
  through the administration list; an unknown key falls back to the raw key

## Task

1. The internal create form replaces `STANDARD_TEXT_KEYS` with the active
   entries of `useFaultCatalog(locale)`.
2. The ticket detail resolves its `faultTemplateKeys` through the same hook, so
   an archived type keeps its label on historical tickets.

## Non-goals

- No change to the public report form (WP-M2-40e).
- No change to the submit payload: the keys stay machine keys.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the internal form lists the active types and the detail
labels an archived type.

## Handoff

- Files changed: the internal create page and the ticket detail page
- Interfaces added: none
- Verified: `npm run typecheck`, `npm run lint`, `npx vitest run apps/web/src/features/tickets/__tests__` (23 tests green)
- Follow-up WP: none
- Open question: none
