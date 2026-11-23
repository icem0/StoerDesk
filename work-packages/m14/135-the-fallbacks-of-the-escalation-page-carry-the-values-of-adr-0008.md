# WP-M14-135: the fallbacks of the escalation page carry the values of ADR-0008

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/05-timeline.md §5.1; docs/DECISIONS/0008-deadline-and-escalation-defaults.md
spec-lines: 20

depends-on: WP-M14-134i

files-read:

- apps/web/src/admin/escalation-page.tsx (the fallbacks of the form)
- packages/shared/src/timeline.ts (the deadline hours of ADR-0008)
- packages/shared/src/schemas/escalation-config.ts (the seeded minutes per priority)
- apps/web/src/admin/__tests__/ (the pattern of the page tests)

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-page-fallbacks.test.tsx

interfaces:

- The tab "Fristen" shows the hours of ADR-0008 (168/72/24/8) before the answer
  of the query arrives
- The rule form shows the seeded minutes per priority (15/15/15/5, …) before the
  answer of the query arrives

## Task

The administration of the escalation (`apps/web/src/admin/escalation-page.tsx`)
knows the deadline hours and the waiting minutes of the rules from the API. The
form needs a value before the answer arrives — and the fallbacks of the page are
wrong:

1. Line 139 falls back to `{ low: 72, normal: 72, high: 72, critical: 72 }`.
   The values of ADR-0008 are `168 / 72 / 24 / 8` hours
   (`packages/shared/src/timeline.ts`, `DEADLINE_HOURS`). A save in that window
   writes 72 hours for every priority.
2. Line 660 falls back to `{ low: 1, normal: 1, high: 1, critical: 1 }`
   minutes. The seeded minutes are `15/15/15/5`, `20/20/20/10`, `30`, `15` and
   `60` (`packages/shared/src/schemas/escalation-config.ts`,
   `DEFAULT_WORKFLOW_ESCALATION_RULES`).

Take the values from the shared package instead of writing them into the page
again, so the fallback can never drift from the ADR and from the seed.

3. Add a page test that proves the tab "Fristen" shows `168h / 72h / 24h / 8h`
   and that the rule form shows the seeded minutes while the query is pending.

## Non-goals

- No change of the deadline hours and of the escalation rules themselves.
- No change of the API.
- No change of the priority of an object (ADR-0029, WP-M14-134 … WP-M14-134i).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the fallbacks of the page carry the values of ADR-0008 and
of the seed.

## Handoff

- Files changed: `apps/web/src/admin/escalation-page.tsx` (the `DEADLINE_HOURS`
  fallback and `seededMinutesFor`), `apps/web/src/admin/__tests__/escalation-page-fallbacks.test.tsx`
  (new)
- Interfaces added: none
- Verified: `npm run typecheck`, `npx eslint` on the changed files,
  `npm run test:run -- apps/web/src/admin/__tests__/escalation-page-fallbacks.test.tsx`
  (2 passed) and `npm run wp:check`
- Follow-up WP: none
- Open question: none
