# WP-M14-175: the transitions of the workflow in the escalation administration

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 40

depends-on: WP-M14-39b

files-read:

- apps/web/src/admin/transition-page.tsx (the editor of the transition table)
- apps/web/src/admin/escalation-page.tsx (the administration of the levels)
- apps/api/src/tickets/transition-service.ts (the rules of the service)
- packages/shared/src/schemas/ticket.ts (the contract of a step)
- apps/web/src/i18n/locales/de/settings.json (the texts of the escalation)
- specs/07-escalation.md (§7.13 the steps are configuration)

files-write:

- apps/web/src/admin/escalation-transitions.tsx
- apps/web/src/admin/**tests**/escalation-transitions.test.tsx
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json
- work-packages/m14/175-the-transitions-of-the-workflow-in-the-escalation.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `EscalationTransitions` — the editor of the steps of the workflow, it takes
  the levels of the chain as its prop
- `groupTransitions` — the steps of every level and the status it waits in
- `admin.escalation.transitions.*` — the texts of the editor (de, en)

## Task

**The comment of the office (out of band in phase 14).** The steps of the
workflow had a page of their own, the „Übergangverwaltung", while the levels
of the escalation had their own page. The office asked for one place: the
steps belong to the levels — the way out of a level is the way out of the
status it waits in — and the target of a step is free, also the status of an
earlier level (a way back).

1. `apps/web/src/admin/escalation-transitions.tsx` (new): `EscalationTransitions`
   reads the steps with `GET /api/v1/admin/transitions` and the statuses with
   `GET /api/v1/admin/statuses` and groups them by the level of the chain: a
   level owns the status its events lead to, the first level owns the status
   of the arrival, a status that no level owns keeps its own group. A row names
   the event and offers the target status as a free choice over all statuses,
   the `active` switch and the remove button; the form adds a step with the
   source status, the event and the target status.
2. The texts `admin.escalation.transitions.*` in `de` and `en` — the hint names
   the way back, the empty workflow stays visible (ADR-0025) and the error
   codes of the API are named.
3. The test proves the grouping, the free target status, the named error code
   and the level without a step.

## Non-goals

- No change of the API, of the table and of the service.
- No change of the levels themselves — the chain stays what it is.
- The page of the transition administration is gone with the next work package.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the grouping, the free target status
and the named error code.

## Handoff

- Files changed: `apps/web/src/admin/escalation-transitions.tsx` (new),
  `apps/web/src/admin/__tests__/escalation-transitions.test.tsx` (new), the two
  locale files, `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `EscalationTransitions`, `groupTransitions`,
  `admin.escalation.transitions.*`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run i18n:check` and the new test (4/4) green
- Follow-up WP: WP-M14-176 (the escalation page carries the editor) — its file
  is created with this commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none
