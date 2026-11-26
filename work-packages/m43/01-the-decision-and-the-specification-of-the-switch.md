# WP-M43-01: the decision and the specification of the switch

format: ctx-256k
status: planned
depends-on: WP-M31-17
phase: 43
milestone: m43
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.13 (the switch), §19.14 (the mailbox)
spec-lines: 80
changed-lines: 320

files-read:

- specs/19-customer-portal.md §19.3 (the registration), §19.13 (the switch), §19.14 (the mailbox)
- apps/api/src/customers/mail.ts (the mailbox of the instance)
- apps/api/src/customers/public-routes.ts (the public routes of the registration)
- apps/web/src/settings/settings-page.tsx (the menu of the settings)
- apps/web/src/admin/dashboard-settings-page.tsx (the pattern of an administration page)
- PLAN.md §16 (the phases), §17 (the rules of a work package)

files-write:

- docs/DECISIONS/0062-the-customer-portal-is-switched-on.md
- docs/DECISIONS.md
- specs/19-customer-portal.md
- PLAN.md
- work-packages/README.md

interfaces:

- ADR-0062 — the customer portal is switched on and the registration needs a cleanly set up mailbox
- `specs/19-customer-portal.md` §19.13/§19.14 — the switch and the readiness of the mailbox
- the phase 42 in the table of the phases

## Task

1. Write **ADR-0062**: the customer portal is switched on; both switches are
   off by default; the registration needs a cleanly set up mailbox; the server
   decides, the page only shows; the mailbox is a channel and not a second
   switch.
2. Amend the slice `specs/19-customer-portal.md` with the chapters §19.13
   (the switch of the administration) and §19.14 (the mailbox of the
   instance with its reasons).
3. Name the phase 42 in the table of `PLAN.md` §16 and in the status of the
   phases; register the decision in the index of the decisions.
4. Announce the phase and its packages in the backlog.

## Non-goals

- No code — the decision decides, the code follows.
- No change of the chapters of the slice that the switch does not touch.

## Acceptance

```bash
npm run lint
npm run wp:check
```

Expected: all green; the decision, the slice and the plan name the same model.

## Handoff

- Files changed: the decision, the index of the decisions, the slice, the plan
  and the backlog
- Interfaces added: ADR-0062 and the two chapters of the slice
- Verified: the commands above
- Follow-up WP: WP-M43-02 — the settings of the portal; WP-M43-03 — the
  effect of the switches
- Open question: none
