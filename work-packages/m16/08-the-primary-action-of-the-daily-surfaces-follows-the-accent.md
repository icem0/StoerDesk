# WP-M16-08: the primary action of the daily surfaces follows the accent

format: small-model
status: planned
depends-on: WP-M16-07
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/features/tickets/ticket-list-page.tsx (the button „Neue Meldung“)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the actions of the ticket)
- apps/web/src/features/tickets/internal-create-page.tsx (the internal creation)
- apps/web/src/features/oncall/my-shifts-page.tsx (the readiness of the colleague)

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/oncall/my-shifts-page.tsx

interfaces:

- the primary action of a page wears the accent of the instance: `bg-accent-600`,
  `hover:bg-accent-700`, `focus-visible:ring-accent-400`
- `specs/13-ui.md` §14.4 — the accent paints the primary action as well

## Task

1. The primary buttons of the four daily surfaces — the ticket list, the ticket
   view, the internal creation and the readiness of the colleague — wear the
   accent of the instance instead of the fixed blue of the build:
   `bg-accent-600 text-white hover:bg-accent-700` and
   `focus-visible:ring-accent-400`.
2. The selected chip of the internal creation wears `bg-accent-600/20`.
3. The ramp keeps the contrast: `accent-600` is the accent mixed with black, so
   the white text of a button stays readable in the light and in the dark theme.
4. `specs/13-ui.md` §14.4 names the primary action of a page beside the frame.

## Non-goals

- No change of the contract, of the API and of the texts.
- No change of the destructive actions, of the links inside a text and of the
  semantic colours of the statuses.
- No change of the administration pages — WP-M16-10a … WP-M16-10g carry them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the existing tests of the pages stay green.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M16-09 (the objects and the settings of the colleagues),
  WP-M16-10a … WP-M16-10g (the administration) — each file exists in the commit
  of the split
- Open question: none
