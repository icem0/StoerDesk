# WP-M14-21: The exit criterion of the messenger channels

format: small-model
status: planned
depends-on: WP-M14-20
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.4, §11.8, §11.14; PLAN.md §12, §16
spec-lines: 40

files-read:

- specs/10-notifications.md §11.4, §11.8, §11.14
- apps/api/src/notifications/outbox.ts (the worker)
- apps/api/src/notifications/__tests__/notification-exit.integration.spec.ts
  (the exit test of phase 7)
- work-packages/m14/ (the packages of the phase)

files-write:

- apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts
- PLAN.md, work-packages/README.md, docs/REPO-MAP.md, CHANGELOG.md

interfaces:

- `apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts`

## Task

1. The integration test runs the real API on a throwaway database and proves
   the three rules of §11.4: the account of a user is used, the selection of
   the user decides the channels of `ticket.created`, and the mandatory minimum
   channels of a critical ticket are queued whatever the selection says.
2. The test proves the warning of §11.8: a failed channel is visible in the
   status of the API, and the chain continues with the next channel.
3. The test proves that the secrets of a channel and of an account never
   appear in an answer, in a log or in an event payload.
4. Bookkeeping: the phase row of `PLAN.md` §16, the backlog of
   `work-packages/README.md`, the map of the repository and the changelog.

## Non-goals

- No product code — a defect found by the test is fixed in its own package.
- No change of an adapter.
- No Docker test — the Docker smoke test of §18.1 runs in CI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the exit test proves the three rules of the precedence,
the warning on a failed channel and the secrecy of the secrets.

## Handoff

- Files changed: the exit test, the plan, the backlog, the map and the
  changelog
- Interfaces added: the exit test of the phase
- Verified: `npm run check`, `npm run build`
- Follow-up WP: none
- Open question: none
