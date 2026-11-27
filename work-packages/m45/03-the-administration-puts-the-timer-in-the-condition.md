# WP-M45-03: the administration puts the timer in the condition

format: ctx-256k
status: planned
depends-on: WP-M45-02
phase: 45
milestone: m45
context-budget: 55k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.4, §7.10; ADR-0064 decision 9; specs/13-ui.md §14.13 (the help popover)
spec-lines: 120
changed-lines: 520

files-read:

- apps/web/src/admin/escalation-page.tsx (the `RuleForm`, the frame „Zeitliche Abfolge“ of WP-M14-94, the ⓘ panels of WP-M44-01)
- apps/web/src/admin/escalation-condition-builder.tsx (`conditionFields`, `conditionValue`, `valueOptions`)
- apps/web/src/i18n/locales/de/settings.json, de/help.json (+ the `en` twins)
- apps/web/src/admin/**tests**/escalation-rules-editor.test.tsx, escalation-stage-tab.test.tsx, escalation-condition-builder.test.tsx
- packages/shared/src/schemas/escalation-config.ts (after WP-M45-02)
- PLAN.md §4.1, §14 (ADR-0060), §18

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/admin/**tests**/escalation-rules-editor.test.tsx
- apps/web/src/admin/**tests**/escalation-condition-builder.test.tsx

interfaces:

- the rule form shows the key of the rule, its condition and its actions — the
  frame „Zeitliche Abfolge“, the field „Start-Ereignis“, the percent field and
  the minutes grid of the rule are gone (ADR-0064 decision 2)
- the condition builder renders the leaf `timer_expired`: the start value as a
  select over the events with their names, the delay as the four minutes
  fields per priority — or the percent field of the timeline variant; the
  operators `expired` („Ablauf“) / `notExpired` („Not yet“)
- the help panels of the rule explain the timer: the minutes are the delay
  per priority, the clock starts at the chosen start value, pauses stop it,
  and **what happens after the expiry**: the rule fires exactly once, writes
  the escalated entry, runs its actions; a reached stage never fires again
- the form sends `reference`, `minutes` and `percent` as `null` — the clock
  lives in the condition; the read of WP-M45-02 already answers old rows with
  the timer leaf, so every configuration opens in the new shape

## Task

1. `escalation-page.tsx`: remove the `fieldset` `escalation-rule-timeline` and
   its fields (`reference`, `percent`, the minutes grid) from the rule form;
   the condition builder and the action editor move up — „a stage rule shows
   its condition and its actions only“. The `Fristen` tab (the deadline hours
   of the timeline) stays untouched. The fallback of the minutes in the page
   (`seededMinutesFor`, WP-M14-135) leaves with the fields; the deadline-hours
   fallback of `DEADLINE_HOURS` stays.
2. `escalation-condition-builder.tsx`: `conditionFields()` already carries the
   leaf from the shared schema. Render its value: the operators
   `expired`/`notExpired`; the value editor offers the start values
   `received_at` („Meldung eingang“), `review_started`, `work_order_set`,
   `offered`, `assigned`, `accepted` — and the percent variant with its
   0–100 field; the four minutes fields per priority use the existing
   priority labels. `conditionValue` types the built object.
3. i18n: `admin.escalation.condition.fields.timer_expired`, the operator names
   and the start-value names in `de` and `en`; the help texts are rewritten —
   `help.escalation.timelineMore` becomes the text of the timer (the delay
   per priority, the chosen start value, the pause rule and the sentence of
   what happens after the expiry: one firing, the escalated entry, the
   actions, never again for a reached stage); the text of the former
   „Start-Ereignis“ field (`referenceMore`) folds into it or leaves with the
   field.
4. Tests: the rule-editor test proves the **absence** of the frame (the form
   shows condition and actions only) and opens a saved default rule whose
   condition carries the seed timer of §7.2; the condition-builder test edits
   the timer leaf — start value, minutes per priority, percent variant — and
   the read-only mode disables it; the stage-tab test stays green.

## Non-goals

- No change of the stage tab (chain, predecessor, names) beyond what the frame
  removal forces.
- No change of the ticket view or the timeline bar.
- No new actions, no action editor change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the rule form of a default rule shows its condition with
the seed timer and its actions — no „Zeitliche Abfolge“ anywhere; every new
text exists in `de` and `en`.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M45-04 exists as a file since WP-M45-00 (re-cut 2026-11-27)
- Open question (if any):
