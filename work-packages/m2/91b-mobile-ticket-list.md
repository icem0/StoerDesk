# WP-M2-91b: mobile-first ticket list cards

format: small-model
status: planned
depends-on: WP-M2-91 (touch target and panel conventions), WP-M2-17b (ticket list)
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (UI), PLAN.md §7 (list filters)
spec-lines: 10

files-read:

- apps/web/src/features/tickets/ticket-list-page.tsx — current list layout (WP-M2-17b)
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx — list tests
- apps/web/src/styles.css — shared style tokens

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx — card rows on phone, table from `sm`
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx — adapted assertions (test)

interfaces:

- below the `sm` breakpoint one ticket = one card row: number, status badge, object and
  priority on one glance, tap target `min-h-11` rows; from `sm` up the existing table grid
  stays
- filters and saved views keep their behavior and keys (no new i18n keys)

## Task

1. `ticket-list-page.tsx`: replace the desktop-only grid classes on the row container with
   a mobile-first stack (`flex flex-col gap-2`, `sm:grid sm:grid-cols-2 lg:grid-cols-3`);
   each row stays `min-h-11`.
2. Row internals: number + status badge on the first line, object name and times below;
   no content is hidden below `sm`.
3. `ticket-list-page.test.tsx`: existing row/badge assertions still pass (text and testid
   based), adapt class-based selectors if any.

## Non-goals

- No filter/search changes, no saved-view changes.
- No theme colors here (WP-M2-92c owns the palette).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- (filled by the implementing commit)
