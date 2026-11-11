# WP-M13-10: The removal of the old escalation API

format: small-model
status: planned
depends-on: WP-M13-05
phase: 13
milestone: m13
context-budget: 18k tokens
spec: specs/07-escalation.md §7.9, §7.11
spec-lines: 60

files-read:

- specs/07-escalation.md §7.9, §7.11
- apps/api/src/settings/escalation-stages.ts
- apps/api/src/tickets/escalation-manual.ts
- apps/api/src/index.ts (the registrations)
- apps/api/src/tickets/__tests__/escalation-manual.integration.spec.ts

files-write:

- apps/api/src/settings/escalation-stages.ts (removed)
- apps/api/src/tickets/escalation-manual.ts (removed)
- apps/api/src/index.ts
- apps/api/src/tickets/__tests__/escalation-manual.integration.spec.ts (removed)

interfaces:

- `POST /api/v1/tickets/:ticketNo/escalate` is gone
- `GET/PUT /api/v1/settings/escalation-stages` are gone
- `GET /api/v1/escalation-stages` stays and answers the new stages (WP-M13-08)

## Task

1. Remove the manual escalation route and the settings routes of the former
   catalogue: the stages of §7.9 replace them.
2. Remove the registrations in `apps/api/src/index.ts` and keep the staff read of
   the stages, now backed by the new table.
3. Remove the integration test of the removed route and add a check that the
   route answers `404` (the route table no longer knows it).
4. Keep the comment route untouched: the comment of the ticket view never used
   the manual escalation route.

## Non-goals

- No change to the shared contracts (WP-M13-11) or to the web (WP-M13-12).
- No change to the workflow routes.
- No deletion of the historic `escalation_set` events.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; no route of the old catalogue is registered any more.

## Handoff

- Files changed: the two removed modules, the registration, the removed test
- Interfaces added: none — routes are removed
- Verified: typecheck, lint
- Follow-up WP: WP-M13-11 — the removal of the old shared contracts
- Open question: none
