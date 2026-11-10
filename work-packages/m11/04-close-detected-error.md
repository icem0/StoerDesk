# WP-M11-04: Close-Route akzeptiert Kommentar und festgestellte Fehler

format: small-model
status: planned
depends-on: WP-M11-02
phase: 11
milestone: m11
context-budget: 18k tokens
spec: specs/13-detected-errors.md §13.3
spec-lines: 50

files-read:

- apps/api/src/tickets/workflow-routes.ts (Close-Route, `makeHandler`)
- apps/api/src/tickets/workflow.ts (`transitionTicket`)
- packages/shared/src/schemas/ticket.ts (`workOrderRequestSchema` etc.)
- apps/api/src/tickets/internal-actions.ts (`applyInternalAction` für Kommentar)

files-write:

- apps/api/src/tickets/workflow-routes.ts (Änderung: Close-Body)
- packages/shared/src/schemas/ticket.ts (Änderung: Close-Request-Schema)

interfaces:

- `closeRequestSchema` (`comment?`, `detectedErrorKeys?: string[]`)
- Erweiterte `closed`-Event-Payload oder separate Ticket-Spalten-Schreibung

## Task

1. `packages/shared/src/schemas/ticket.ts`: `closeRequestSchema` mit optionalen
   Feldern `comment` (text, max 2000) und `detectedErrorKeys` (UUID-Array,
   max 20).
2. `apps/api/src/tickets/workflow-routes.ts`: Die Close-Route
   (`event: 'closed'`) akzeptiert den Body. `comment` wird als `comment`-Event
   geschrieben (über `applyInternalAction` oder direkt als Event, idempotent
   mit `clientUuid`), `detectedErrorKeys` auf die Ticket-Spalte
   `detected_error_keys` geschrieben — beides in derselben Transaktion wie der
   `closed`-Übergang. Beide Felder optional; Body insgesamt optional.
3. `transitionTicket` bleibt unverändert; das Schreiben der Spalte passiert im
   Route-Handler im selben Transaction wie das Event.

## Non-goals

- Pflichtfeld, UI, Offline-Queue für Close.
- `transitionTicket`-Änderung.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
```

Erwartet: Typecheck grün; Integrationstest (WP-M11-09) beweist: Close mit und
ohne `comment`/`detectedErrorKeys` speichert beides korrekt.

## Handoff

- Dateien geändert: `workflow-routes.ts`, `ticket.ts`
- Interfaces hinzugefügt: `closeRequestSchema`
- Verifiziert: Typecheck grün
- Follow-up WP: WP-M11-05
- Offene Frage: keine
