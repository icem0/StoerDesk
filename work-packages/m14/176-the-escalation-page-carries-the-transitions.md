# WP-M14-176: the escalation page carries the editor of the transitions

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 15k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 40

depends-on: WP-M14-175

files-read:

- apps/web/src/admin/escalation-page.tsx (the tabs of the administration)
- apps/web/src/admin/escalation-transitions.tsx (the editor of the steps)
- apps/web/src/admin/**tests**/escalation-stage-tab.test.tsx (the test of the tabs)
- apps/web/src/i18n/locales/de/settings.json (the texts of the tabs)
- specs/07-escalation.md (§7.13 the steps are configuration)
- docs/REPO-MAP.md (the module of the escalation page)

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/**tests**/escalation-stage-tab.test.tsx
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json
- work-packages/m14/176-the-escalation-page-carries-the-transitions.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- the tab `Übergänge` of the escalation administration — the third tab beside
  `Fristen` and `Stufen & Regeln`
- `admin.escalation.tabs.transitions` — the name of the tab (de, en)

## Task

1. `apps/web/src/admin/escalation-page.tsx`: the administration carries the
   third tab `Übergänge`. It shows `EscalationTransitions` with the levels of
   the chain, so the steps of the workflow are managed where the levels are.
2. The texts `admin.escalation.tabs.transitions` in `de` and `en`.
3. The test of the tabs expects the tab and the groups of the levels.

## Non-goals

- No change of the levels, of the rules and of the API.
- The page of the transition administration is gone with the next work package.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the tabs expects the third tab.

## Handoff

- Files changed: `apps/web/src/admin/escalation-page.tsx` (the third tab),
  `apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx` (the test of the tab),
  the two locale files, `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document and the files of WP-M14-177 and
  WP-M14-178
- Interfaces added: the tab `Übergänge` of the escalation administration,
  `admin.escalation.tabs.transitions`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run i18n:check` and the tests of the tabs (6/6) green
- Follow-up WP: WP-M14-177 (the page of the transition administration is gone)
  and WP-M14-178 (the dead texts and the spec) — their files are created with
  this commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none
