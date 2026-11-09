# WP-M9-28: shared LIKE escaping for ticket and object search

format: small-model
status: done
depends-on: WP-M9-27
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §15 (audit — SEC-012); specs/06-report-form.md §7.3 (ticket list search); specs/08-objects-api.md §9.1 (object list search)
spec-lines: 30

files-read:

- apps/api/src/tickets/list.ts — inline search escaping
- apps/api/src/objects/service.ts — inline object search pattern
- packages/shared/src/index.ts — shared exports

files-write:

- packages/shared/src/search.ts (new)
- packages/shared/src/index.ts
- apps/api/src/tickets/list.ts
- apps/api/src/objects/service.ts

interfaces:

- `escapeLikePattern(value: string): string` — escapes `\`, `%` and `_` so a SQL LIKE matches the literal search string; a trailing backslash no longer swallows the closing wildcard (fail-closed)

## Task

1. `packages/shared/src/search.ts` (new): export `escapeLikePattern` —
   `value.replace(/([\\%_])/g, '\\$1')`.
2. Export it from `packages/shared/src/index.ts`.
3. `apps/api/src/tickets/list.ts`: replace
   `query.search.replace(/[%_]/g, '\\$&')` with
   `escapeLikePattern(query.search)` — also fixes the backslash bug
   (SEC-003 fix for ticket search, SEC-012 for object search).
4. `apps/api/src/objects/service.ts`: replace
   `` `%${query.search}%` `` with
   `` `%${escapeLikePattern(query.search)}%` ``.

## Non-goals

- No migration, no schema change, no i18n change, no UI change.
- No change of search semantics beyond literal matching.

## Acceptance

```bash
npm run check
```

Expected: green.

## Handoff

- Files changed: the new shared helper, its export, the ticket list and the object list
- Interfaces added: `escapeLikePattern`
- Verified: `npm run check`
- Follow-up WP: WP-M9-29 (ticketNoSchema, SEC-015)
- Open question: none
