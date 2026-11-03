# WP-M2-40d: fault type entry on the administration home

format: small-model
status: done
depends-on: WP-M2-40c
phase: 2
context-budget: 4k tokens
spec: specs/06-report-form.md §7.9
spec-lines: 12

files-read:

- apps/web/src/admin/admin-home-page.tsx — the `MODULES` table
- work-packages/m2/40c-text-template-admin-ui.md — the route name

files-write:

- apps/web/src/admin/admin-home-page.tsx

interfaces:

- administration-home module `standardTexts` links to `/admin/text-templates`
  instead of being marked as planned

## Task

1. Turn the `standardTexts` module row into a link to `/admin/text-templates`.
   The title and hint already say "Störungsarten"/"Fault types" (WP-M2-40c).

## Non-goals

- No route, page or locale change (WP-M2-40c).
- No phase marker for the module remains.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; `/admin` shows the fault type card as available.

## Handoff

- Files changed: the administration-home module table
- Interfaces added: none
- Verified: `npm run typecheck`, `npm run lint`
- Follow-up WP: WP-M2-40e (public report form catalog)
- Open question: none
