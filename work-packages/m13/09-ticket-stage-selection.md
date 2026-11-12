# WP-M13-09: The stage selection replaces the workflow buttons

format: small-model
status: done
depends-on: WP-M13-08
phase: 13
milestone: m13
context-budget: 26k tokens
spec: specs/07-escalation.md §7.10
spec-lines: 50

files-read:

- specs/07-escalation.md §7.10
- apps/web/src/features/tickets/ticket-detail-page.tsx (the actions and the forms)
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json
- apps/api/src/tickets/workflow-routes.ts (the routes of the transitions)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx

interfaces:

- the ticket view selects a stage; the choice opens the form of the milestone
  (AA/SA number, assignee, result) and performs the workflow route of it
- the actions that are no milestone (decline, claim, e-mail, cancel, delete)
  stay buttons

## Task

1. Replace the six workflow buttons with one selection of the stages the server
   answers as reachable (`availableStages`); the selection carries the name of
   the stage.
2. Choosing a stage opens the existing form of the milestone and performs the
   workflow route of it; the state of the ticket is the single source of the
   reachable stages, so the button logic of the status disappears.
3. Remove the stage dropdown of the former manual catalogue and its request to
   `/v1/escalation-stages`; the comment stays and goes to the comment route.
4. Add the German and English texts and rewrite the component test: the
   selection offers the reachable stages, a choice performs the route of the
   milestone.

## Non-goals

- No change to the workflow routes or to the state machine.
- No change to the timeline, the photos or the history.
- No removal of the shared contract (WP-M13-11).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the test proves the selection, the route of the chosen
milestone and the remaining buttons.

## Handoff

- Files changed: the ticket view, the two locale files, the component test
- Interfaces added: none beyond the answer of WP-M13-08
- Verified: typecheck, the component test, the i18n check
- Deviation: the locale texts of the former catalogue (`commentOption`, `submitStage`, `saved`) were removed with WP-M13-13 in the same commit
- Follow-up WP: WP-M13-10 — the removal of the old API
- Open question: none
