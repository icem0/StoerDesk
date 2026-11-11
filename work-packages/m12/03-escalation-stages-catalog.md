# WP-M12-03: Escalation-stage catalog — shared contract and settings API

format: small-model
status: done
depends-on: —
phase: 12
context-budget: 20k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 60

files-read:

- PLAN.md
- specs/07-escalation.md
- apps/api/src/settings/deadlines.ts
- packages/shared/src/schemas/deadlines.ts

files-write:

- packages/shared/src/schemas/escalation-stages.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/settings/escalation-stages.ts
- apps/api/src/index.ts

interfaces:

- `escalationStagesSchema`, `EscalationStage`, `EscalationStages`
- `DEFAULT_ESCALATION_STAGES`, `ESCALATION_STAGES_KEY`
- `nextEscalationStage(stages, currentKey)`, `escalationStageName(stage, locale)`
- `readEscalationStages(database): Promise<EscalationStage[]>`
- `GET /api/v1/escalation-stages`, `GET/PUT /api/v1/settings/escalation-stages`

## Task

1. Add the shared stage contract: ordered array of `{ key, names, deadlineMinutes }`,
   at least `de` and `en` names, 1–20 stages, unique keys, 1–10080 minutes.
2. Add the defaults (`office`, `group`, `assignee`, `manager`) and the helpers
   `nextEscalationStage` and `escalationStageName`.
3. Store the catalog as the `settings` row `ticket.escalation_stages`; a missing or
   malformed row falls back to the defaults.
4. Expose the staff read (`ticket.read`) and the admin pair
   (`settings.read`/`settings.write`), validating the body and answering
   `400 invalid_request` with field paths.

## Non-goals

- No admin UI (WP-M12-04).
- No ticket write path (WP-M12-05).
- No change to the automatic rule scan of `apps/api/src/tickets/escalation.ts`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- packages/shared/src/__tests__/escalation-stages.test.ts
npm run wp:check
```

Expected: all green; the shared unit test covers next-stage selection and validation.

## Handoff

- Files changed: shared stage contract, settings service, route registration, shared test.
- Interfaces added: see above.
- Verified: typecheck, shared unit test.
- Follow-up WP: WP-M12-04 — admin UI for the catalog.
- Open question: none
