# WP-M45-04: the administration puts the timer in the condition

format: ctx-256k
status: done
depends-on: WP-M45-03
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

- Files changed: `admin/escalation-page.tsx` (the frame „Zeitliche Abfolge“, the percent field, the minutes grid and `seededMinutesFor` are gone), `admin/escalation-condition-builder.tsx` (the leaf `timer_expired`), the keys in `settings.json` and `help.json` (de, en), the web tests
- Interfaces added: the condition builder renders `timer_expired`: the start value as a select over the six events plus „Prozent der Frist“, the delay as four minutes fields or the percent field, the operators `expired`/`notExpired`; a changed field resets the operator and the value that no longer fit; `help.escalation.timerMore` replaces `timelineMore` and `referenceMore` and names the effect after the expiry
- Verified: the rule-editor test proves the absence of the frame and opens a default rule with its seed timer, edits start value, minutes and the percent variant, offers the timer as a field and disables it read-only; typecheck of the three workspaces, `eslint .` (0 errors), the full `vitest run` against a throwaway PostgreSQL 17 (2177 of 2178 green; the one failure `web-push-esm.spec.ts` fails the same way before the change), `npm run build`, `wp:check`; `npm run i18n:check` was run with a copy of the script that splits the paths on both separators — the script itself reports 1654 phantom keys on Windows (it splits on `/`); `npm run test:e2e` was not run here (unverified)
- Follow-up WP: none — the phase 45 is complete when this package is done
- Open question: none — the phase 45 is complete
