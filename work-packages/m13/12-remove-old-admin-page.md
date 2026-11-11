# WP-M13-12: The removal of the old administration page

format: small-model
status: planned
depends-on: WP-M13-11
phase: 13
milestone: m13
context-budget: 18k tokens
spec: specs/07-escalation.md §7.9, §7.11; PLAN.md §14
spec-lines: 70

files-read:

- specs/07-escalation.md §7.9, §7.11
- apps/web/src/admin/escalation-stages-page.tsx
- apps/web/src/routes/index.tsx (the route table)
- apps/web/src/admin/admin-home-page.tsx (the module list)
- apps/web/src/settings/settings-page.tsx (the settings overview)

files-write:

- apps/web/src/admin/escalation-stages-page.tsx (removed)
- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/settings/settings-page.tsx

interfaces:

- the route `/admin/escalation-stages` is gone; `/admin/escalation` takes its
  place (WP-M13-14)
- the administration home and the settings overview list one module:
  "Eskalation"

## Task

1. Remove the page of the former catalogue and its route.
2. Replace the two entries of the administration home (deadlines, escalation
   stages) with the new module "Eskalation".
3. Replace the two entries of the settings overview with the same module.
4. Keep the route of the deadlines for the transition: the new page of
   WP-M13-14 carries the deadline tab, the old route answers a redirect.

## Non-goals

- No new page in this package (WP-M13-14).
- No change to the texts of the locale files (WP-M13-13).
- No change to the deadlines form.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; no link of the application points to the removed page.

## Handoff

- Files changed: the removed page, the route table, the administration home, the
  settings overview
- Interfaces added: none — the page is removed
- Verified: typecheck, lint
- Follow-up WP: WP-M13-13 — the cleanup of the texts
- Open question: none
