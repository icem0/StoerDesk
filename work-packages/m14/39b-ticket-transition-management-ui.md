# WP-M14-39b: Ticket transition management UI

format: small-model
status: planned
depends-on: WP-M14-39
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.1, PLAN.md §7
spec-lines: 40

files-read:

- apps/api/src/tickets/transition-service.ts
- apps/web/src/lib/api.ts

files-write:

- apps/web/src/admin/transition-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `TransitionPage` — Tabelle aller Transitionen (von → nach, Event-Key, aktiv); Formular zum Anlegen/Editieren; Guard `settings.write`
- i18n keys `admin.transition.*`

## Task

1. `apps/web/src/admin/transition-page.tsx`: `TransitionPage` — Tabelle aller Transitionen (von → nach, Event-Key, aktiv); Formular zum Anlegen/Editieren; Guard `settings.write`.
2. `apps/web/src/i18n/locales/{de,en}/settings.json`: Keys `admin.transition.*`.

## Non-goals

- Die API-Routen und der Service (WP-M14-39).
- Keine Eskalations-Aktion (WP-M14-40).
- Keine Zeitabhängigkeit von Transitionen (nacht/tagsüber — späterer WP).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: alle grün; die Transition-Seite rendert und die i18n-Keys parity de/en haben.

## Handoff

- Files changed: `transition-page.tsx`, `settings.json` (de/en)
- Interfaces added: `TransitionPage`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-40 (status_change als Eskalations-Aktion)
- Open question (if any): none
