# WP-M36-06: the readiness and the tickets name their marks in a panel

format: ctx-256k
status: planned
depends-on: WP-M36-02
phase: 36
milestone: m36
context-budget: 56k tokens
spec: specs/13-ui.md §14.9, §14.13; specs/04-oncall.md; PLAN.md §14
spec-lines: 220
changed-lines: 460

files-read:

- specs/13-ui.md (§14.9 the order of the list, §14.13 the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/components/help-popover.tsx
- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/oncall/shift-admin-actions.tsx
- apps/web/src/features/oncall/planning-section.tsx
- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/ticket-timeline.tsx

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/oncall/shift-admin-actions.tsx
- apps/web/src/features/oncall/planning-section.tsx
- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json

interfaces:

- `HelpPopover` replaces the `title=` of a readiness cell, of a milestone marker and of a deadline
- `help.readiness.<item>More`, `help.tickets.<item>More` — the panel bodies
- the state of a readiness cell stays readable without the panel (not colour alone, §14.2)

## Task

The surfaces the office opens every day carry their `title=` tooltips today:
the readiness cell (`${stateLabel} – ${poolName} – ${holder}`), the milestones
of the timeline, the deadline of a ticket row, the actions of a shift.

1. **The readiness calendar**: the cell names its state and its holder in the
   panel of the cell; the state itself stays visible as a shape and a text, not
   a colour alone (§14.2).
2. **The shift actions** name their rule in the panel (the release of a shift of
   WP-M34-01, the handover) — and the rule of the delete of a shift that already
   started (ADR-0047) stays visible, because it decides whether an action exists.
3. **The ticket list**: the deadline and the urgency of a row move into the panel
   of the row; the order of the office (§14.9) and the open default of WP-M35-03
   stay untouched.
4. **The timeline**: the milestone marker keeps its visible label and names the
   event in the language of the interface in the panel (WP-M14-153 keeps its
   buttons).
5. **The tests** of these pages stay green and gain the assertions: no
   `title=` carries an explanation, the panel of a readiness cell opens on tap,
   the text of a blocked action stays visible where the rule decides the action.

## Non-goals

- No statistics, no object sticker, no notification card — WP-M36-07.
- No change of the state machine, of the deadlines or of the pools.
- No change of the filter menu of the ticket overview (WP-M35-03, ADR-0059).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the moved tooltips fail before the change and pass after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M36-07 (the statistics, the objects and the notification cards)
- Open question: none
