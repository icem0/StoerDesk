# WP-M13-17: The exit criterion of the escalation phase

format: small-model
status: planned
depends-on: WP-M13-16
phase: 13
milestone: m13
context-budget: 24k tokens
spec: specs/07-escalation.md §7.1–§7.11; PLAN.md §18
spec-lines: 190

files-read:

- specs/07-escalation.md §7.1–§7.11
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
- docs/REPO-MAP.md

files-write:

- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
- work-packages/README.md, docs/REPO-MAP.md, CHANGELOG.md

interfaces:

- the exit test: a stage deadline fires its rule once, the condition decides,
  the three actions run, the second scan is a no-op, the ticket view offers the
  reachable stages

## Task

1. Add the exit test: a ticket in the waiting state of a stage fires its rule
   after the configured minutes, the second scan fires nothing, a condition that
   does not match keeps the rule silent, the `notify`, `webhook` and `history`
   actions write their rows, and the deadline rules fire at 80 % and 100 %.
2. Prove the removal: the old route answers `404`, the old administration page
   is gone and the ticket view offers the stages instead of the workflow buttons.
3. Update `docs/REPO-MAP.md` (the new modules and the removed ones), the backlog
   of `work-packages/README.md` and the `CHANGELOG.md`.
4. Report the exit criterion of the phase in the handoff.

## Non-goals

- No new feature and no new gate.
- No weakening of an existing test.
- No change to the acceptance suite of WP-M12-02.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run check
```

Expected: all green; the exit test proves the criterion of the phase.

## Handoff

- Files changed: the exit test, the component test, the repository map, the
  backlog, the changelog
- Interfaces added: none
- Verified: typecheck, lint, the whole test run, the i18n check, the wp check,
  the whole check gate
- Follow-up WP: none
- Open question: none
