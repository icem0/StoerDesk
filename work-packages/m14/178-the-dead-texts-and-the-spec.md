# WP-M14-178: the dead texts of the deleted page are gone and the spec names the place

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 40

depends-on: WP-M14-177

files-read:

- apps/web/src/i18n/locales/de/settings.json (the texts of the deleted page)
- apps/web/src/i18n/locales/de/common.json (the entry of the menu)
- specs/07-escalation.md (§7.13 the steps are configuration)
- docs/REPO-MAP.md (the modules of the administration)
- work-packages/m14/175-the-transitions-of-the-workflow-in-the-escalation.md
  (the editor of the steps)

files-write:

- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json
- apps/web/src/i18n/locales/de/common.json,
  apps/web/src/i18n/locales/en/common.json
- specs/07-escalation.md
- work-packages/m14/178-the-dead-texts-and-the-spec.md, docs/REPO-MAP.md,
  PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `admin.transition.*` — the texts of the deleted page, gone
- `app.settingsItems.transitions` — the entry of the menu, gone
- `specs/07-escalation.md` §7.13 — names the escalation administration as the
  place of the steps

## Task

1. The texts `admin.transition.*` of the deleted page are gone in `de` and
   `en`.
2. The entry `app.settingsItems.transitions` of the settings menu is gone in
   `de` and `en`.
3. `specs/07-escalation.md` §7.13 names the place: the steps of the workflow
   are managed in the escalation administration, with the levels, and the
   target status of a step is free — also the status of an earlier level.

## Non-goals

- No change of the API, of the table and of the service.
- No new text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the texts of the deleted page are gone.

## Handoff

- Files changed: the four locale files, `specs/07-escalation.md` (§7.13),
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: none — the dead texts are gone and the spec names the place
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run i18n:check` and `npm run test:run` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
