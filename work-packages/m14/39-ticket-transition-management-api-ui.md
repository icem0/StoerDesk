# WP-M14-39: Ticket transition management API and UI

format: small-model
status: planned
depends-on: WP-M14-38
phase: 14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.1, PLAN.md §7
spec-lines: 60

files-read:

- apps/api/src/tickets/transition-service.ts
- apps/api/src/tickets/status-service.ts
- apps/web/src/admin/status-page.tsx
- apps/web/src/lib/api.ts

files-write:

- apps/api/src/tickets/transition-routes.ts
- apps/api/src/tickets/transition-service.ts
- apps/web/src/admin/transition-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /api/v1/admin/transitions` — alle Transitionen
- `POST /api/v1/admin/transitions` — neue Transition anlegen
- `PATCH /api/v1/admin/transitions/:id` — Transition ändern
- `DELETE /api/v1/admin/transitions/:id` — Transition löschen

## Task

1. `apps/api/src/tickets/transition-routes.ts`: Fastify-Routes unter `/api/v1/admin/transitions` mit `settings.read` / `settings.write` Guards; Validierung, dass `from_status` und `to_status` gültige Status-Schlüssel sind und keine doppelte `(from_status, event_key)` entsteht.
2. `apps/api/src/tickets/transition-service.ts`: `createTicketTransition`, `updateTicketTransition`, `deleteTicketTransition` ergänzt (WP-M14-38 hatte nur Read).
3. `apps/web/src/admin/transition-page.tsx`: `TransitionPage` — Tabelle aller Transitionen (von → nach, Event-Key, aktiv); Formular zum Anlegen/Editieren; Guard `settings.write`.
4. `apps/web/src/i18n/locales/{de,en}/settings.json`: Keys `admin.transition.*`.

## Non-goals

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

Expected: alle grün; CRUD für Transitionen funktioniert; doppelte `(from_status, event_key)` wird mit `409` abgelehnt; ungültige Status-Schlüssel mit `400`.

## Handoff

- Files changed: `transition-routes.ts`, `transition-service.ts`, `transition-page.tsx`, `settings.json` (de/en)
- Interfaces added: 4 Admin-Routes für Transitionen, `TransitionPage`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-40 (status_change als Eskalations-Aktion)
- Open question (if any): ob Transitionen auch Bedingungen (condition_json) tragen sollen, die vor dem Wechsel geprüft werden.
