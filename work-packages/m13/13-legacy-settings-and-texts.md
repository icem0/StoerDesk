# WP-M13-13: The cleanup of the texts and of the legacy settings

format: small-model
status: planned
depends-on: WP-M13-12
phase: 13
milestone: m13
context-budget: 18k tokens
spec: specs/07-escalation.md §7.2, §7.9, §7.11; PLAN.md §3
spec-lines: 80

files-read:

- specs/07-escalation.md §7.2, §7.11
- apps/api/src/settings/deadlines.ts (the reaction minutes)
- apps/api/src/tickets/escalation.ts (the reading of the legacy rows)
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/api/src/settings/deadlines.ts
- apps/api/src/tickets/escalation.ts
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `GET/PUT /api/v1/settings/deadlines` answers the deadline hours per priority;
  the reaction minutes move to the rules of the stages
- the legacy rows `ticket.escalation.<rule>.minutes` are read by the seed only

## Task

1. Remove the reaction minutes from the deadlines settings: the deadlines of a
   stage belong to its rule, the deadline hours per priority stay where they are.
2. Stop reading the legacy rows in the scan; the rules of the database are the
   only source.
3. Remove the texts of the former catalogue and of the manual escalation from the
   German and the English locale files; the label of the event `escalation_set`
   stays, because historic rows still carry it.
4. Run the i18n check: every key exists in both locales and no key is unused.

## Non-goals

- No deletion of the legacy settings rows (they stay, read-only, for the audit).
- No change to the deadline hours.
- No new text beyond the names of the new modules.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the deadlines route answers the hours, the legacy rows are
only read by the seed and the locale files have no orphan key.

## Handoff

- Files changed: the deadlines route, the scan, the four locale files
- Interfaces added: none
- Verified: typecheck, the i18n check, the whole test run
- Follow-up WP: WP-M13-14 — the administration page
- Open question: none
