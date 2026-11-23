# WP-M16-19: the stages of the escalation show the localized name

format: small-model
status: planned
depends-on: WP-M16-18
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.8; ADR-0043; specs/07-escalation.md §7.11
spec-lines: 30

files-read:

- apps/web/src/admin/escalation-page.tsx (the stage tab, the editor of a stage)
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx
- apps/web/src/i18n/locales/de/settings.json and apps/web/src/i18n/locales/en/settings.json

interfaces:

- the stage list of `/admin/escalation`: one name per stage (the name of the set
  language) and a row menu with „Bearbeiten“ and „Entfernen“
- the editor of a stage: the key (read-only) and the name per language — it
  opens with „Bearbeiten“ and closes with the save or a second click
- `admin.escalation.stage.edit` — the label of the action in the row menu

## Task

1. The stage row of the tab „Stufen“ shows one name: the name of the current
   locale (`stage.names[i18n.language]`, the fallback `de` and then the key).
   The editor with the two name fields and the key is closed while the stage is
   not edited.
2. The actions of the stage sit behind the shared `RowMenu`: „Bearbeiten“ opens
   the editor of the stage (and closes the editor of the other stage),
   „Entfernen“ asks for the confirmation of the removal (the `removeCandidate`
   of the page stays). The button „Entfernen“ of the editor is gone.
3. The editor keeps the key read-only, the name per language, the predecessor
   and the active flag; every change saves as before (`saveStages`).
4. The keys of the stage in `settings.json` (de and en) gain
   `admin.escalation.stage.edit`.
5. The test proves: the stage list shows the German name in the German
   interface and the English name in the English one, the two name fields are
   closed until „Bearbeiten“ was chosen, the row menu carries the two actions
   and the editor shows the key.

## Non-goals

- No change of the API, of the chain validation and of the rules of a stage.
- No change of the tab „Fristen“ and of the deadline hours.
- No change of the rules of a stage — they stay visible under their stage.
- No change of the add form of a stage (`/admin/escalation/stages/new`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the three entries of `files-write`
- Interfaces added: `admin.escalation.stage.edit`
- Verified: the commands above
- Follow-up WP: WP-M16-20a, WP-M16-20b, WP-M16-20c, WP-M16-20d (each file
  exists in the commit of the split)
- Open question: none
