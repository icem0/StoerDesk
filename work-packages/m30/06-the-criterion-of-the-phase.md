# WP-M30-06: the criterion of the phase

format: ctx-256k
status: planned
depends-on: WP-M30-05
phase: 30
milestone: m30
context-budget: 44k tokens
spec: specs/10-notifications.md §11.12, §11.16, §11.17, §11.18; PLAN.md §16 (phase 30)
spec-lines: 100
changed-lines: 380

files-read:

- specs/10-notifications.md §11.16, §11.17, §11.18 (the protocol, the alarm, the task)
- apps/api/src/notifications/__tests__/phase24-exit.integration.spec.ts (the criterion of the phase 24 — the model)
- apps/api/src/notifications/__tests__/phase25-exit.integration.spec.ts (the criterion of the phase 25)
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx (the test of the inbox)
- apps/api/src/notifications/items.ts, apps/api/src/notifications/alarm.ts (the services of the phase)

files-write:

- apps/api/src/notifications/__tests__/phase30-exit.integration.spec.ts
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- docs/REPO-MAP.md
- CHANGELOG.md
- PLAN.md §16

interfaces:

- none new — the criterion names the behaviour of the packages of the phase

## Task

1. **The criterion** `apps/api/src/notifications/__tests__/phase30-exit.integration.spec.ts`
   (in the manner of `phase25-exit.integration.spec.ts`) names every acceptance
   item of the phase and proves it against the real database:
   - a personal delivery over three confirmed channels writes **one** task for
     the recipient and three rows of the protocol,
   - the task carries the event type, the params and the reference to the
     ticket — and no topic, no address and no secret,
   - the list of the tasks of a user answers his own tasks only, the count
     answers the unhandled ones and the receipt of a foreign task is refused,
   - the protocol answers the attempts with their recipient, their channel,
     their state and their machine code — and `403 forbidden` without
     `notification.read_all`,
   - a delivery that fails finally writes a task for a user with the right and
     none for a user without it, a second failure of the same channel and the
     same code within the hour writes no second task, and the failure of the
     alarm channel writes no task at all.
2. **The test of the inbox** proves that the page shows the readable text of a
   task, the link into the ticket and the read receipt — and that it names no
   channel and no delivery state any more.
3. **The module map** `docs/REPO-MAP.md` names the modules of the phase —
   `apps/api/src/notifications/items.ts` and
   `apps/api/src/notifications/alarm.ts` — with their public API.
4. **The changelog** `CHANGELOG.md` and the status of the phase in `PLAN.md`
   §16: the phase 30 is closed.

## Non-goals

- No new behaviour — the criterion proves what the packages of the phase
  built.
- No change of the emergency rule of `PLAN.md` §2 — nothing of the phase
  touches the report path of the customers.
- No change of the alarm of the instance (ADR-0048) and of the workflow
  settings — the state „handled“ stays undecided.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the criterion of the phase fails before the packages of
the phase and passes after them.

## Handoff

- Files changed: the criterion, the test of the inbox, the module map, the
  changelog and the status of the phase
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none — phase 30 is closed
- Open question: the state „handled“ of a task and the question, which events
  are tasks at all, belong to the settings of the workflow — a later phase
  decides it, the notification layer does not
