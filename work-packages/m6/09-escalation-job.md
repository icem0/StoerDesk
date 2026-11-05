# WP-M6-09: pg-boss escalation job

format: small-model
status: done
depends-on: WP-M6-08
phase: 6
milestone: m6
context-budget: 16k tokens
spec: specs/07-escalation.md §7.3
spec-lines: 40

files-read:

- specs/07-escalation.md §7.3
- apps/api/src/jobs/qr-cleanup.ts (job pattern)
- apps/api/src/tickets/escalation.ts
- apps/api/src/index.ts (startup wiring)

files-write:

- apps/api/src/jobs/escalation.ts
- apps/api/src/index.ts
- apps/api/src/jobs/__tests__/escalation-job.integration.spec.ts

interfaces:

- `TICKET_ESCALATION_QUEUE = 'ticket-escalation'`
- `TICKET_ESCALATION_CRON = '* * * * *'`
- `startTicketEscalation(connectionString, log?): Promise<PgBoss>`

## Task

1. Add the job module in the shape of `qr-cleanup.ts`: create the queue, work
   it with a short-lived pool per run and schedule it every minute.
2. Log only `{ queue, scanned, fired }`.
3. Start it from the direct API start and stop it in the existing `onClose`
   hook next to the other jobs.
4. Integration test the queue name/cron constants and one direct
   `evaluateEscalations` run; pg-boss itself is not started by `buildServer()`.

## Non-goals

- No second scheduler in tests.
- No notification send.
- No dashboard tile.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the job constants and a scan run are covered.

## Handoff

- Files changed: job module, startup wiring, test
- Interfaces added: the queue/cron constants and `startTicketEscalation`
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-10 (timeline API)
- Open question: none
