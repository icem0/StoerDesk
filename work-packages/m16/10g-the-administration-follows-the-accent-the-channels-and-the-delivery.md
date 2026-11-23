# WP-M16-10g: the administration follows the accent — the channels, the delivery and the update

format: small-model
status: done
depends-on: WP-M16-10f
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/admin/webhook-create-page.tsx
- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/delivery-page.tsx
- apps/web/src/admin/bma-sync-page.tsx

files-write:

- apps/web/src/admin/webhook-create-page.tsx
- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/delivery-page.tsx
- apps/web/src/admin/bma-sync-page.tsx

interfaces:

- the primary action of the administration pages wears the accent of the instance:
  `bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`

## Task

1. The pages of the channels, the delivery and the update wear the accent of the instance instead of the fixed
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

- Files changed: apps/web/src/admin/webhook-create-page.tsx,
  apps/web/src/admin/channels-page.tsx, apps/web/src/admin/delivery-page.tsx,
  apps/web/src/admin/bma-sync-page.tsx
- Interfaces added: the primary actions of the pages (the save of a channel, the
  "alle quittieren" of the delivery problems, the create submit of a webhook,
  the save of the credentials and of the schedule of the BMAcloud pull and the
  "Jetzt abgleichen") and their focus rings wear the accent of the instance
  (`bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`); the
  text links of the pages (the web push guide, the own channels, the ticket of a
  lost message and the back link of the BMAcloud page) wear `text-accent-300`.
  The emerald of the token panel and of the verification, the rose of the
  failures and the amber of the notes stay. The badge of a running BMAcloud pull
  keeps its blue: it is a state and not a brand (ADR-0036).
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run` with the
  page tests of the channels, the delivery problems, the BMAcloud pull and the
  webhook, `npm run wp:check` and `npm run test:e2e` — the whole `npm run check`
  green
- Follow-up WP: WP-M16-10h (the detected errors and the update panel) — the file
  exists in the commit of the split
- Open question: none — the WP carried the broken dependency `WP-M16-NaN`; it is
  corrected to `WP-M16-10f` in this commit.
