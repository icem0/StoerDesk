# WP-M14-153: the milestones of the ticket view are buttons next to each other

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.10; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-152c

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the escalation section)
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx (the stage tests)
- apps/web/e2e/workflow.spec.ts (the workflow of the office)
- apps/web/src/i18n/locales/de/ticket.json (the labels of the section)
- specs/07-escalation.md (§7.10 the ticket view)
- docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md (the consequence)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/{de,en}/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx,
  apps/web/e2e/workflow.spec.ts, apps/web/e2e/offline-internal.spec.ts,
  scripts/e2e-acceptance.mjs
- specs/07-escalation.md (§7.10),
  docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md (the consequence)

interfaces:

- `availableStages` — the stages the ticket can still reach; every stage and
  every event of a stage is a button of the view
- `detail.escalation.stageLabel` — the heading above the buttons; the key
  `detail.escalation.chooseStage` is gone (the selection is gone with it)

## Task

**The comment of the office (out of band in phase 14).** The „Workflow Stufen" of
the ticket detail was a pulldown menu: on a touch screen the milestone lies one
step away behind the menu, and the confirmation of a milestone (the number of
the work order, the result of the acknowledge) appeared **above** the control
that opened it.

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the selection
   (`ticket-escalation-stage`) becomes a row of buttons
   (`ticket-escalation-stages`) under the heading `detail.escalation.stageLabel`.
   Every event of every reachable stage is a button (`ticket-stage-<event>`), so
   a stage that is reached by several steps offers one button per step. The
   wording is the wording of the former selection: the name of the milestone, or
   the name of the step (`ACTION_LABELS`) when one milestone is reached by
   several steps. The buttons are only there for a ticket that is neither closed
   nor cancelled.
2. The confirmation panel of a milestone (`renderConfirmPanel()`) stands **below**
   the buttons, not above them: the block of the action section carries the
   milestone buttons, the actions that are no milestone and the panel at its
   end. The comment composer keeps its own block below.
3. `apps/web/src/i18n/locales/{de,en}/ticket.json`: the key
   `detail.escalation.chooseStage` is gone — the placeholder of the selection is
   no longer needed. No new text: the heading of the buttons and the labels of
   the steps stay.
4. The tests follow the buttons: the page test reads the events of the buttons,
   the workflow of the office and the offline suite click the button of the
   milestone, the acceptance script clicks it as well.

## Non-goals

- No change of the stages themselves: the server still answers the reachable
  stages with the ticket (`availableStages`, §7.10).
- No change of the actions that are no milestone (decline, close, reopen,
  delete) and none of the other sections of the page.
- No new text in `de` and `en` — the wording of the buttons is the wording of
  the former selection.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page test proves the buttons of the reachable stages
and that the confirmation of a milestone stands below them.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx` (the
  buttons of the milestones, the panel below them),
  `apps/web/src/i18n/locales/{de,en}/ticket.json` (the placeholder is gone), the
  page test, the two e2e suites, the acceptance script, `specs/07-escalation.md`
  §7.10, `docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md`,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: none; the key `detail.escalation.chooseStage` is gone
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
