# WP-M14-65: The administration adds, removes and chains stages

format: small-model
status: planned
depends-on: WP-M14-62, WP-M14-64
phase: 14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.9, §7.11; PLAN.md §14
spec-lines: 130

files-read:

- apps/web/src/admin/escalation-page.tsx (the stage tab)
- apps/api/src/escalation/config.ts (the replace-all body)
- packages/shared/src/schemas/escalation-config.ts (`EscalationStageConfig`)
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the stage tab lists `config.stages` instead of the fixed `ESCALATION_STAGE_KEYS`
- `admin.escalation.stage.predecessor`, `admin.escalation.stage.add`,
  `admin.escalation.stage.remove`, `admin.escalation.errors.stageChainInvalid`

## Task

1. The stage tab lists the stages the server answered (`config.stages`, ordered by
   `position`), so a stage an installation added appears and a stage it removed
   does not.
2. Per stage show the predecessor as a select over the other stages with
   "kein Vorgänger" / "no predecessor" as the first entry; the checkbox writes
   `predecessor` and saves the whole set with one `PUT /api/v1/escalation/stages`.
3. Add a row "Stufe hinzufügen" / "Add stage": the key field (lowercase key
   pattern), the two name fields, the position, the active switch and the
   predecessor select — a save without a key is rejected client-side and the
   server validates the chain again.
4. Add the remove action per stage: it sends the set without that stage and the
   hint names that the rules of that stage are removed as well (the cascade of
   §7.11); the confirmation dialog shows the affected rule keys.
5. Add the i18n keys in `de` and `en` (`settings` namespace), including the error
   text for a chain the server refused.

## Non-goals

- No rule editor change (WP-M13-15/16 stay), no condition builder change.
- No new tab, no new route, no permission change.
- No change of the API or the server validation (WP-M14-62 owns it).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18next/no-literal-string` stays satisfied; the de/en key
parity of the new keys passes.

## Handoff

- Files changed: (filled by the implementing run)
- Interfaces added: (filled by the implementing run)
- Verified: (filled by the implementing run)
- Follow-up WP: WP-M14-66 (the stage tab tests)
- Open question: none
