# WP-M44-01: the escalation administration names its explanations in panels

format: ctx-256k
status: done
depends-on: WP-M36-02
phase: 44
milestone: m44
context-budget: 52k tokens
spec: specs/13-ui.md §14.13 (the explanation of a place); specs/07-escalation.md §7.1 (the page)
spec-lines: 60
changed-lines: 280

files-read:

- specs/13-ui.md §14.13 (the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/components/help-popover.tsx (the mechanism, WP-M36-02)
- apps/web/src/components/page-help.tsx (the page-level ⓘ)
- apps/web/src/components/page-help-map.ts (the page of the escalation)
- apps/web/src/settings/settings-menu.tsx (the naming of a trigger with `help:triggerFor`)
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
- apps/web/src/i18n/locales/de/help.json and apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
- apps/web/src/i18n/locales/de/help.json, apps/web/src/i18n/locales/en/help.json
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `HelpPopover` — the mechanism of WP-M36-02, consumed by the escalation page
- `help.escalation.deadlinesMore`, `help.escalation.stagesMore`, `help.escalation.chainMore`,
  `help.escalation.referenceMore`, `help.escalation.timelineMore`,
  `help.escalation.conditionMore`, `help.escalation.actionsMore`,
  `help.escalation.notifyMore` — the panel bodies in `de` and `en`
- `help.page.adminEscalation` — the panel of the page-level ⓘ, now names the page
  **and** what the user does there
- `admin.escalation.hint` and `admin.escalation.help.*` — gone from the
  settings namespace; no explanation of the escalation page is always visible any more

## Task

The office asked again at `/admin/escalation`: the explanations of that page
stand as **seven always-visible small paragraphs** (`admin.escalation.help.*`
plus the page intro `admin.escalation.hint`) and one hint in the action
editor (`admin.escalation.action.notifyHint`). They clutter the surface and the
text is `text-xs` — unreadable without a zoom. ADR-0060 already decided the
answer: an explanation stands behind the ⓘ at its place, never as prose on the
page.

1. **The texts move to the `help` namespace** — `help.escalation.<item>More` in
   `de` and `en` (`apps/web/src/i18n/locales/<lng>/help.json`), at most three
   sentences each; the keys `admin.escalation.hint` and
   `admin.escalation.help.*` are removed from the settings namespace in both
   languages.
2. **The intro of the page is gone**: the shell already carries one page-level
   ⓘ for `/admin/escalation` (`page-help-map.ts`); its text
   `help.page.adminEscalation` names the page and the mechanics of the chain in
   at most three sentences.
3. **One ⓘ per place** on the escalation page, each labelled with
   `help:triggerFor` and the name of the thing it explains:
   - beside the grid of the hours → `help.escalation.deadlinesMore`
   - above the list of the stages → `help.escalation.stagesMore`
   - beside the field „Vorgänger“ of a stage → `help.escalation.chainMore`
   - beside the field „Start-Ereignis“ of a rule → `help.escalation.referenceMore`
   - inside the block „Zeitliche Abfolge“ of a rule →
     `help.escalation.timelineMore`
   - above the condition of a rule → `help.escalation.conditionMore`
   - above the actions of a rule → `help.escalation.actionsMore`
4. **The hint of a notify action** in `apps/web/src/admin/escalation-action-editor.tsx`
   moves into the panel of an ⓘ beside the recipient of the action
   (`help.escalation.notifyMore`); the sentence that explains the value „assigned“
   (`admin.escalation.action.targetAssigned`) **stays visible**, because it
   replaces the field the user would otherwise click (§14.13 rule 3).
5. **Nothing that belongs to a rule moves**: the read-only notice, the reason of
   the removal of a stage (`stage.removeHint` in its alertdialog), the save
   errors and the session notices stay visible.
6. **The tests** of the escalation page keep their assertions and gain the new
   ones: the panel of a trigger opens on click and names its body in the
   language of the interface, the page carries no always-visible explanation
   paragraph and no `title=`.

## Non-goals

- The `title=` of the other administration pages and the other 120 hint
  paragraphs of the interface — WP-M36-05, WP-M36-06, WP-M36-07.
- The type scale and the contrast of the meta text — WP-M36-08.
- No escalation behaviour, no API change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the assertions of the moved explanations pass on the open
panel only.

## Handoff

- Files changed: the escalation page, the action editor, the localization test
  and the texts of `help.json` and `settings.json` in `de` and `en`
- Interfaces added: the eight panel bodies `help.escalation.*More`, the label
  key `admin.escalation.rule.actions`, the enriched `help.page.adminEscalation`
- Verified: typecheck, lint, the test run (8 escalation files, 55 tests),
  i18n:check (2279 keys in de and en), wp:check, the Playwright e2e suite
- Follow-up WP: none
- Open question: none
