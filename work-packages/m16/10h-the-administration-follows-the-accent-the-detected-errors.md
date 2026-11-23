# WP-M16-10h: the administration follows the accent — the detected errors

format: small-model
status: done
depends-on: WP-M16-10g
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/admin/update-panel.tsx
- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/detected-error-create-page.tsx

files-write:

- apps/web/src/admin/update-panel.tsx
- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/detected-error-create-page.tsx

interfaces:

- the primary action of the administration pages wears the accent of the instance:
  `bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`

## Task

1. The pages of the detected errors wear the accent of the instance instead of the fixed
   blue of the build: the primary buttons become `bg-accent-600 text-white
   hover:bg-accent-700`, the focus rings become `focus-visible:ring-accent-400`
   and the links of a page become `text-accent-300`.
2. The semantic colours stay: the states of a ticket, of a channel and of a
   readiness keep their emerald, rose and amber — they carry a meaning and not
   a brand (ADR-0036).

## Non-goals

- No change of the contract, of the API, of the texts and of the behaviour.
- No change of the destructive actions.
- No change of the other administration pages — the other batches of the sweep
  carry them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the existing tests of the pages stay green.

## Handoff

- Files changed: apps/web/src/admin/update-panel.tsx,
  apps/web/src/admin/detected-errors-page.tsx,
  apps/web/src/admin/detected-error-create-page.tsx
- Interfaces added: none — the primary actions and the focus rings of the three
  pages wear the accent of the instance (`bg-accent-600`,
  `hover:bg-accent-700`, `focus-visible:ring-accent-400`, the field labels of
  the two forms carry `focus:border-accent-400` and
  `focus:ring-accent-500/30`); the rose of a failed answer and the slate of the
  reload button stay
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run wp:check` and the page tests — all green; the API integration tests
  stay red in this container before and after the change (no Docker, the DB hook
  times out), so they are reported as unverified
- Follow-up WP: none — this closes the last open item of phase 16
- Open question: none — the WP carried the broken dependency `WP-M16-NaN`; it is
  corrected to `WP-M16-10g` in this commit
