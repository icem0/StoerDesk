# WP-M6-19b: deadline page edits the escalation stage names

format: small-model
status: done
depends-on: WP-M6-19
phase: 6
milestone: m6
context-budget: 16k tokens
spec: specs/07-escalation.md §7.2; PLAN.md §3.1
spec-lines: 40

files-read:

- apps/web/src/admin/deadlines-page.tsx — the form and its state
- apps/web/src/admin/__tests__/deadlines-page.test.tsx — the page test
- apps/web/src/i18n/locales/de/settings.json — the German labels
- apps/web/src/i18n/locales/en/settings.json — the English labels

files-write:

- apps/web/src/admin/deadlines-page.tsx — the stage text fields
- apps/web/src/i18n/locales/de/settings.json — the German labels
- apps/web/src/i18n/locales/en/settings.json — the English labels

interfaces:

- the deadline page edits the name and the description of every escalation
  stage next to the reaction minutes they belong to.
- i18n keys `admin.deadlines.stageTitle`, `stageHint`, `stageLabel`,
  `stageDescription`, `localeDe`, `localeEn` and the two new rule labels
  `admin.deadlines.rules.deadline_80_percent` and `.deadline_exceeded`.

## Task

1. `apps/web/src/admin/deadlines-page.tsx`: add the fieldset
   "Bezeichnungen der Eskalationsstufen" below the reaction minutes. One row per
   escalation rule (the six keys of `ESCALATION_RULES`), one text input for the
   German and one for the English name, and the same for the description. The
   inputs stay read-only without `settings.write`.
2. The rule list of the page comes from `ESCALATION_RULES` of the shared
   package, so the page and the server cannot drift apart.
3. The changed texts travel with the existing PUT of the page; the body keeps
   the shape of `DeadlineSettings`.
4. Add the i18n keys in `de` and `en` and extend the page test: the six names
   are shown and a changed name reaches the PUT body.

## Non-goals

- No change to the hours or to the reaction minutes.
- No validation beyond the shared schema (the server rejects a malformed body).
- No change of the route (WP-M6-19 carries the contract).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `de` and `en` stay symmetric.

## Handoff

- Files changed: the page, its test and the two locale files
- Interfaces added: the six i18n keys and the two rule labels
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npx vitest run apps/web/src/admin/__tests__/deadlines-page.test.tsx` (5 passed),
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M6-19c (the ticket history shows the texts)
- Open question: none
