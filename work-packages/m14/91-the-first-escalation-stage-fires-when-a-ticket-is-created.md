# WP-M14-91: the first escalation stage fires when a ticket is created

format: small-model
status: done
depends-on: WP-M14-90
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 20

files-read:

- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/report.ts
- apps/api/src/tickets/external.ts
- apps/api/src/tickets/internal.ts

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/report.ts
- apps/api/src/tickets/external.ts
- apps/api/src/tickets/internal.ts

interfaces:

- a rule of the stage without predecessor is due at `received_at`
- every ticket creation path evaluates the ticket after its transaction
- an open pause still suppresses the firing

## Task

1. Treat the stage without predecessor as open at creation: its rules are due
   immediately, independent of `reference` and `minutes`.
2. Keep the condition evaluation and suppress the firing while a pause is open.
3. Call the targeted escalation scan after the ticket transaction in the public
   report, the internal creation and the external API.
4. Extend the escalation integration test with the creation path of the external
   API and keep the paused-ticket expectation.

## Non-goals

- No change of the minute rules of later stages.
- No change of the one-minute scan job.
- No retry or queue for a failed immediate evaluation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the escalation integration suite passes (6/6).

## Handoff

- Files changed: the scan decision, the three creation paths, the integration
  test and the repository bookkeeping
- Interfaces added: immediate first-stage evaluation at creation
- Verified: API typecheck; escalation integration 6/6; creation suites 30/30
- Follow-up WP: WP-M14-92 (first stage never deleted)
- Open question: none
