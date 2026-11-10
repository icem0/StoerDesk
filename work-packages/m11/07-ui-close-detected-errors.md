# WP-M11-07: Ticket-Detail Close-Panel mit festgestellten Fehlern

format: small-model
status: planned
depends-on: WP-M11-04
phase: 11
milestone: m11
context-budget: 18k tokens
spec: specs/13-detected-errors.md §13.5
spec-lines: 50

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (Close-Panel `closed`,
  `handleAction`, `ACTION_SEGMENTS`)
- apps/web/src/i18n/locales/{de,en}/ticket.json (i18n-Muster)
- apps/web/src/lib/api.ts (`apiFetch`)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx (Änderung: Close-Panel)
- apps/web/src/i18n/locales/de/ticket.json (Änderung)
- apps/web/src/i18n/locales/en/ticket.json (Änderung)

interfaces:

- Close-Panel ergänzt um Multiselect für festgestellte Fehler
- i18n `ticket.detail.detectedErrors.*`

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: Im Close-Panel
   (bereits vorhanden für `status === 'ACKNOWLEDGED'` → `closed`) ein
   Multiselect-Dropdown für festgestellte Fehler ergänzen (vom API
   `/v1/detected-errors` geladen, nur nicht-archivierte). Beide Felder optional:
   bestehendes Kommentar-Feld + neue Multiselect-Auswahl.
2. Bei Confirm: Body `{ comment, detectedErrorKeys }` an
   `/v1/tickets/:ticketNo/close` senden.
3. i18n-Keys unter `ticket.detail.detectedErrors.*` in de und en.

## Non-goals

- Pflichtfeld, Offline-Queue für Close.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
```

Erwartet: Typecheck grün; `i18n:check` grün; UI-Test (skippbar).

## Handoff

- Dateien geändert: `ticket-detail-page.tsx`, beide `ticket.json`
- Interfaces hinzugefügt: Close-Dialog-Multiselect
- Verifiziert: Typecheck grün, i18n:check grün
- Follow-up WP: WP-M11-08
- Offene Frage: keine
