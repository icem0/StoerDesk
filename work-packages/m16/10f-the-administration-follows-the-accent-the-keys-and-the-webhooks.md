# WP-M16-10f: the administration follows the accent — the keys and the webhooks

format: small-model
status: done
depends-on: WP-M16-10e
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/admin/dashboard-settings-page.tsx
- apps/web/src/admin/api-keys-page.tsx
- apps/web/src/admin/api-key-create-page.tsx
- apps/web/src/admin/webhooks-page.tsx

files-write:

- apps/web/src/admin/dashboard-settings-page.tsx
- apps/web/src/admin/api-keys-page.tsx
- apps/web/src/admin/api-key-create-page.tsx
- apps/web/src/admin/webhooks-page.tsx

interfaces:

- the primary action of the administration pages wears the accent of the instance:
  `bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`

## Task

1. The pages of the keys and the webhooks wear the accent of the instance instead of the fixed
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

- Files changed: apps/web/src/admin/dashboard-settings-page.tsx,
  apps/web/src/admin/api-keys-page.tsx, apps/web/src/admin/api-key-create-page.tsx,
  apps/web/src/admin/webhooks-page.tsx
- Interfaces added: the primary actions (create links, the save submits) and the
  focus rings of the slate secondary actions of the pages of the keys and the
  webhooks wear the accent of the instance (`bg-accent-600`,
  `hover:bg-accent-700`, `focus-visible:ring-accent-400`); the rose of the
  revoke, delete and rotate confirmations and the amber note stay
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run` with the
  page tests of the keys and the webhooks, `npm run wp:check` and
  `npm run test:e2e` — the whole `npm run check` green
- Follow-up WP: the next batch of the sweep — every file exists in the commit of
  the split
- Open question: none — the WP carried the broken dependency `WP-M16-NaN`; it is
  corrected to `WP-M16-10e` in this commit.
