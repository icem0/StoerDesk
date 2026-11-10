# WP-M6-19: configurable escalation stage names and descriptions

format: small-model
status: done
depends-on: WP-M6-08, WP-M6-14b
phase: 6
milestone: m6
context-budget: 20k tokens
spec: specs/07-escalation.md §7.2; PLAN.md §3, §9
spec-lines: 60

files-read:

- apps/api/src/tickets/escalation.ts — the event writer of the `escalated` event
- apps/api/src/settings/deadlines.ts — the deadline settings route
- packages/shared/src/escalation.ts — the rule definitions
- packages/shared/src/schemas/deadlines.ts — the settings contract
- apps/api/src/settings/__tests__/deadlines.integration.spec.ts — the settings test
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts — the scan test

files-write:

- packages/shared/src/escalation.ts — `ESCALATION_STAGE_TEXTS`, the default texts of the six stages
- packages/shared/src/schemas/deadlines.ts — `stageTexts` in the settings contract
- apps/api/src/tickets/escalation.ts — `readStageTexts()` and the payload fields
- apps/api/src/settings/deadlines.ts — `stageTexts` in GET and PUT

interfaces:

- `ESCALATION_STAGE_TEXTS: Record<EscalationRuleKey, EscalationStageText>` — the
  default name and description of every stage, both in `de` and in `en`.
- `readStageTexts(database): Promise<Record<EscalationRuleKey, EscalationStageText>>`
  — the defaults, replaced by the installation's own texts.
- the `escalated` event payload carries `label` and `description`, each a
  `{ de, en }` object.
- `GET`/`PUT /api/v1/settings/deadlines` carry `stageTexts`.

## Task

1. `packages/shared/src/escalation.ts`: add the type `EscalationStageText` and the
   resource `ESCALATION_STAGE_TEXTS` with a name and a description per rule. The
   texts are localized data like the standard texts, never a German literal in
   the API (`PLAN.md` §3).
2. `packages/shared/src/schemas/deadlines.ts`: add `escalationStageTextSchema`
   (name 1–120 characters, description 1–500 characters, per language) and the
   field `stageTexts` of `deadlineSettingsSchema`; the shape follows the rule
   keys.
3. `apps/api/src/tickets/escalation.ts`: add `readStageTexts()`, which reads the
   rows `ticket.escalation.<rule>.label` and `.description` and merges them over
   the defaults; a malformed row falls back to the default. The scan writes
   `label` and `description` into the `escalated` payload, so the history keeps
   the texts of the moment the stage fired.
4. `apps/api/src/settings/deadlines.ts`: the GET answers the effective
   `stageTexts`; the PUT stores a row only when the text differs from the
   shipped default, so a default stays changeable and a reset needs no row.

## Non-goals

- No change to the rules, their thresholds, their levels or the job.
- No migration — the `settings` table already holds jsonb.
- No rendering of the texts in the web app (WP-M6-19b, WP-M6-19c).
- No public status page (it shows no event details).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The settings test proves that a changed text is stored, that
an unchanged one is not stored and that the scan writes the configured texts into
the event payload.

## Handoff

- Files changed: the four files above plus the two test files
- Interfaces added: `ESCALATION_STAGE_TEXTS`, `readStageTexts()`, `stageTexts`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npx vitest run apps/api/src/settings/__tests__/deadlines.integration.spec.ts
  apps/api/src/tickets/__tests__/escalation.integration.spec.ts
  apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts` (15 passed),
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M6-19b (the admin page), WP-M6-19c (the ticket history)
- Open question: none
