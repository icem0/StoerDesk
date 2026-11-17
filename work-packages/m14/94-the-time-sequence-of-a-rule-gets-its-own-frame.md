# WP-M14-94: the time sequence of a rule gets its own frame

format: small-model
status: done
depends-on: WP-M14-93
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.11; PLAN.md §14, §18
spec-lines: 60

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

interfaces:

- the stage row of the tab shows the key of the stage before its names
- the rule form groups the reference, the percent and the minutes into a frame
  with the legend `admin.escalation.rule.timeline`

## Task

1. The stage row of the tab `Stufen & Regeln` shows the key of the stage as a
   read-only field before the two names, the predecessor and the active flag;
   the key is the identity of the stage and stays uneditable.
2. The rule form moves the time fields (start event, percent, minutes per
   priority) out of the flat row into a `fieldset` with the legend
   `admin.escalation.rule.timeline` and the hint `admin.escalation.help.timeline`;
   the key of the rule stays above, the condition builder and the action editor
   stay below the frame.
3. `de` and `en` carry the two new keys.
4. The rule editor test proves the frame with its fields and the order of the
   stage fields.

## Non-goals

- No change of the saved values, of the schema or of the API.
- No change of the condition builder and of the action editor.
- No new rule, no new stage and no change of the escalation logic.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the escalation page, the two locale files, the rule editor
  test and the repository bookkeeping
- Interfaces added: the frame of the time sequence of a rule
- Verified: `npm run check`, the rule editor and stage tab tests
- Follow-up WP: none — the escalation work packages of phase 14 are complete
- Open question: none
