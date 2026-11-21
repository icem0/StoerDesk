# WP-M14-174 — Techniker-Name in der Ticketübersicht

status: done

## Ziel

In der Ticketübersicht (`TicketListPage`, `apps/web/src/features/tickets/ticket-list-page.tsx`) wird vor dem Status-Badge ein weiteres Feld angezeigt, das den Namen des zugewiesenen Technikers trägt. So hat der Blick auf die Liste sofort im Überblick, welcher Mitarbeiter ein Ticket bestätigt bzw. übernommen hat.

## Änderungsfläche

- `packages/shared/src/schemas/ticket.ts` — `TicketListItem` erhält das optionale Feld `assignedUserName` (Name des zugewiesenen Technikers, sonst nicht gesetzt).
- `apps/api/src/tickets/list.ts` — `GET /api/v1/tickets` joined `users` (LEFT JOIN auf `assigned_user_id`) und liefert den Klarnamen (`given_name family_name`, fallback E-Mail) als `assignedUserName` mit.
- `apps/web/src/features/tickets/ticket-list-page.tsx` — `TicketRow` rendert vor dem Status einen kleinen Badge mit dem Techniker-Namen, wenn einer zugewiesen ist.
- `apps/web/src/i18n/locales/de/ticket.json` + `en/ticket.json` — neuer i18n Key `list.technician` ("Techniker" / "Technician") als Label des Badges.

## Abhängigkeiten

Keine. `assigned_user_id` existiert bereits als Spalte von `tickets` (Migration `0006`).

## Abnahme

- Ein Ticket mit `assigned_user_id` zeigt in der Liste vor dem Status den Techniker-Namen.
- Ein Ticket ohne Zuweisung zeigt kein Techniker-Feld.
- `npm run check` (typecheck, lint, tests, i18n) ist grün.
- Commit: `feat(web): WP-M14-174 assigned technician name in ticket list`
