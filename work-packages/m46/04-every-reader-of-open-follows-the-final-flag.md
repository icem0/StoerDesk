# WP-M46-04: every reader of „open“ follows the final flag

format: ctx-256k
status: planned
depends-on: WP-M46-03
phase: 46
milestone: m46
context-budget: 55k tokens
spec: specs/11-dashboard.md; specs/12-stats.md; specs/07-escalation.md §7.2; specs/05-timeline.md
spec-lines: 80
changed-lines: 480

files-read:

- PLAN.md §3, §4.1, §6, §17, §18
- work-packages/m46/03-an-open-ticket-is-a-ticket-without-a-final-status.md (the helpers)
- apps/api/src/tickets/status-service.ts (`openStatusCondition`, `readFinalStatusKeys`)
- apps/api/src/dashboard/service.ts, apps/api/src/stats/compliance.ts
- apps/api/src/tickets/escalation.ts, pauses.ts, detail.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx, status-page.tsx, object-ticket-page.tsx
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/api/src/dashboard/service.ts
- apps/api/src/stats/compliance.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/pauses.ts
- apps/api/src/tickets/detail.ts
- packages/shared/src/schemas/ticket.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/status-page.tsx
- apps/web/src/features/tickets/object-ticket-page.tsx
- apps/web/src/i18n/locales/de/ticket.json, en/ticket.json
- apps/api/src/dashboard/**tests**/dashboardService.integration.spec.ts
- apps/web/src/features/tickets/**tests**/status-page.test.tsx

interfaces:

- the ticket detail answers `ticket.statusFinal: boolean` (the `is_terminal` of
  its status); the detail page hides the workflow buttons and the comment
  form by that flag instead of `status === 'CLOSED' || 'CANCELLED'`
- the public views name an acknowledged ticket „Rückmeldung erfolgt am …“
  instead of „Rückmeldung bis …“
- `OPEN_TICKET_STATUSES` and `isOpenTicketStatus` leave the shared contract

## Task

WP-M46-03 made the list, the QR landing, the duplicate hint, the report and
the portal read `is_terminal`. The remaining readers still name
`'CLOSED', 'CANCELLED'` as literals: the dashboard counts
(`dashboard/service.ts` three times), the compliance of the statistics, the
deadline rules of the escalation job, the pause rule and the detail. A
ticket ended by a custom final status („Erledigt“, set by the action
„Statuswechsel“) would still count on the dashboard, stay pausable and keep
the workflow buttons. The review also saw „Rückmeldung erfolgt“ beside
„Rückmeldung bis 30.11.“ on the public view of an acknowledged ticket.

1. `dashboard/service.ts`, `stats/compliance.ts`: replace the literal lists
   with `openStatusCondition`.
2. `tickets/escalation.ts`, `tickets/pauses.ts`: the final statuses come from
   `readFinalStatusKeys`; `ACKNOWLEDGED` stays in both rules as it is today
   (the response deadline is met at the acknowledgement, §7.2).
3. `tickets/detail.ts`: `terminal` and the new `ticket.statusFinal` read the
   flag of the status row.
4. `ticket-detail-page.tsx`: the menu, the workflow buttons and the comment
   form use `statusFinal`; the cancel/uncancel options keep their check of
   `CANCELLED`, which names one status, not the class of final ones.
5. `status-page.tsx`, `object-ticket-page.tsx`: when the timeline carries the
   acknowledgement, the deadline row reads „Rückmeldung erfolgt am
   {{time}}“; otherwise „Rückmeldung bis {{time}}“ as today.
6. `packages/shared/src/schemas/ticket.ts`: remove `OPEN_TICKET_STATUSES` and
   `isOpenTicketStatus` (no reader left).
7. i18n `de`/`en`: `status.acknowledgedAtLabel`.
8. Tests: the dashboard counts a ticket with a custom final status as
   closed; the public view of an acknowledged ticket shows the
   acknowledgement time and no deadline.

## Non-goals

- No redesign of the workflow or of the escalation (the office will rethink
  both on its own).
- No change of the status administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `git grep -n "'CLOSED', 'CANCELLED'" -- apps/api/src`
finds no reader outside the seed and the tests.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question (if any):
