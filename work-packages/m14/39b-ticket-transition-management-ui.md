# WP-M14-39b: Ticket transition management UI

format: small-model
status: done
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
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json
- apps/web/src/i18n/locales/{de,en}/common.json

interfaces:

- `TransitionPage` — Tabelle aller Transitionen (von → nach, Event-Key, aktiv); Formular zum Anlegen/Editieren; Guard `settings.write`
- i18n keys `admin.transition.*`

## Task

1. `apps/web/src/admin/transition-page.tsx`: `TransitionPage` — Tabelle aller Transitionen (von → nach, Event-Key, aktiv); Formular zum Anlegen/Editieren; Guard `settings.write`.
2. `apps/web/src/i18n/locales/{de,en}/settings.json`: Keys `admin.transition.*`.
3. `apps/web/src/i18n/locales/{de,en}/common.json`: `auth.links.transitions`.
4. `apps/web/src/routes/index.tsx`: Route `/admin/transitions` behind `RequireSession`. `apps/web/src/settings/settings-page.tsx`: the menu entry `transitions` in the administration group.

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

Expected: alle grün; die Transition-Seite rendert und die i18n-Keys parity de/en haben; `apps/web/src/admin/__tests__/transition-page.test.tsx` proves the table, the guards, the create and edit form, the `404 transition_not_found` of a rejected delete, the `409 transition_duplicate` of a duplicated step and the empty-workflow notice of ADR-0025.

## Handoff

- Files changed: `transition-page.tsx`, `routes/index.tsx`, `settings-page.tsx`, `settings.json` + `common.json` (de/en), test `transition-page.test.tsx`
- Interfaces added: `TransitionPage` (`/admin/transitions`), i18n keys `admin.transition.*`, `auth.links.transitions`
- Verified: `npm run check` green (typecheck, eslint, `vitest run` 1278 tests incl. the new page test, `i18n:check` 1540/1540 keys, `wp:check`, 14 Playwright e2e tests) and `npm run build` green
- Follow-up WP: WP-M14-40 (status_change als Eskalations-Aktion)
- Open question (if any): none — `condition` stays stored and unanswered by the page (WP-M14-41 evaluates it)
