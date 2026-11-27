# WP-M46-01: the escalation administration saves a draft

format: ctx-256k
status: planned
depends-on: WP-M45-04
phase: 46
milestone: m46
context-budget: 60k tokens
spec: specs/13-ui.md §14.14; specs/07-escalation.md §7.9
spec-lines: 70
changed-lines: 640

files-read:

- PLAN.md §3, §4.1, §17, §18
- specs/13-ui.md §14.13, §14.14
- specs/07-escalation.md §7.3–§7.5, §7.9, §7.11
- apps/web/src/admin/escalation-page.tsx (the page, the stage tab, the `RuleForm`)
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/api/src/escalation/config.ts (`writeEscalationConfig`, `writeEscalationStages`)
- apps/api/src/escalation/routes.ts
- packages/shared/src/schemas/escalation-config.ts (after WP-M45-02)
- apps/web/src/i18n/locales/de/settings.json, en/settings.json

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/api/src/escalation/config.ts
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/api/src/escalation/**tests**/config-routes.integration.spec.ts
- apps/web/src/admin/**tests**/escalation-rules-editor.test.tsx
- apps/web/src/admin/**tests**/escalation-stage-tab.test.tsx
- apps/web/src/admin/**tests**/escalation-actions-editor.test.tsx

interfaces:

- the tab „Stufen & Regeln“ edits a **draft**: no field sends a request; one
  bar with „Speichern“ and „Verwerfen“ appears while the draft differs from
  the last saved state (§14.14)
- „Speichern“ validates the draft with the shared schemas first; an invalid
  draft names the place of the error and sends nothing
- the save sends `PUT /api/v1/escalation/stages` and then
  `PUT /api/v1/escalation/config`, one after the other, never in parallel; the
  bar shows „Wird gespeichert …“, then „Gespeichert“ or the error of the code
- both writers of `config.ts` take one transaction-scoped advisory lock
  (`pg_advisory_xact_lock`) before they read or write — two writes of the
  configuration run one after the other (§7.9)
- leaving the page with an unsaved draft asks first (`useBlocker` of the
  router and `beforeunload`)

## Task

The review of 2026-11-27 reproduced it on a live instance. Every field of
`/admin/escalation` sends the whole configuration on every keystroke. Six
backspaces in a stage name sent six `PUT /stages` and deleted **one**
character, because the controlled input waits for the answer of the server.
Five fast keystrokes in a minutes field sent five `PUT /config`, and one of
them answered `500` (`duplicate key … escalation_rules_key_key`): two
transactions deleted and reinserted the same rule keys at once. A draft
that fails the schema is dropped without a word: switching a condition
from „Priorität“ to „Zugewiesen“ kept the value `normal`, the form showed
„Zugewiesen = Ja“ and the server kept „Priorität = normal“.

1. `config.ts`: `writeEscalationConfig` and `writeEscalationStages` start
   their transaction with `pg_advisory_xact_lock` on **one** shared key (the
   stage write cascades into the rules, so both writers share it) and read
   what they validate inside that transaction. Concurrent writes now
   serialize: no `500`, the last write wins as a whole.
2. `escalation-page.tsx`: the stage tab holds one draft
   `{ stages, rules }`, seeded from the query, and a `dirty` flag from a deep
   comparison with the last saved state. Name, predecessor and active flag
   of a stage, the removal of a stage and every change of a rule update the
   draft only. The removal confirmation stays and names the **names** of
   the removed rules; the rules leave the draft with the stage.
3. The save bar (sticky at the bottom of the tab, visible only while
   `dirty` or while saving): „Speichern“ validates with
   the shared `escalationStagesBodySchema` and `escalationRuleConfigSchema`
   per rule (the rules body schema lives in the API only). An invalid
   draft shows „Bitte die markierten Felder prüfen“ and marks the rule or
   stage of the first failing path (`aria-invalid` plus the rose border).
   A valid draft saves stages, then rules, sequentially; the button is
   disabled while the save runs. The error of the answer is named by its
   code (`invalid_request` with its field paths, `invalid_target`,
   `session_invalid`, `forbidden`). „Stage chain invalid“ is used only for
   the chain issues of the stage write. „Verwerfen“ resets the draft to the
   last saved state. After a save the draft is the answer of the server.
4. `escalation-condition-builder.tsx`: the builder is controlled (value plus
   `onChange`), not seeded once. Changing the field of a leaf resets its
   operator to the first operator of the field and its value to the first
   option or an empty value. Changing the operator between single and list
   converts the value. The key of a leaf row is a stable id, not
   `field-index`, so the focus survives a field change. The mode select
   „alle/eine“ stands above the leaves, its label is „Verknüpfung“.
5. `escalation-action-editor.tsx`: controlled as well; a new action gets the
   smallest free `action_<n>` key of the rule, never a duplicate.
6. The tab „Fristen“ keeps its save button and gains the same pending and
   success states („Wird gespeichert …“, „Gespeichert“); an empty or zero
   hours field blocks the save with the field marked.
7. i18n `de`/`en`: `admin.escalation.draft.save`, `.discard`, `.saving`,
   `.saved`, `.invalid`, `.leaveConfirm`, `admin.escalation.condition.join`.
8. Tests: the API test fires two `PUT /config` and a `PUT /stages` with
   `Promise.all` and expects only `200` answers and a configuration equal to
   one of the bodies. The web tests prove: typing a stage name sends no
   request; „Speichern“ sends exactly one `PUT /stages` and one
   `PUT /config`, in that order; an invalid draft sends nothing and marks the
   field; a field change of a condition resets operator and value; „Verwerfen“
   restores the saved state; a removed and re-added action gets a unique key.

## Non-goals

- No optimistic concurrency between two administrators (version or ETag);
  the last write wins, serialized.
- No visual restyle of the inputs, no units next to the numbers, no change of
  the tabs into `role="tab"` (a follow-up of the review, not this feature).
- No new escalation field, action or condition leaf.
- No change of the stage create page `/admin/escalation/stages/new`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new API test fails before step 1 with a `500` or a
duplicate key; the web test „typing sends no request“ fails before step 2.
The integration test needs the database — without it the gate is reported
as unverified (`PLAN.md` §18).

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — the visual points of the review (input contrast,
  units, the tab roles, the names of the row menus, the webhook ids) stay a
  remark here until the office asks for them
- Open question (if any):
