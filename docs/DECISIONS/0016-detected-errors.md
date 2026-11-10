# ADR-0016: Festgestellte Fehler (detected errors)

- Status: accepted
- Date: 2026-11-10
- Stakeholders: office, manager, admin, technician

## Context

Beim Abschluss eines Tickets (`ACKNOWLEDGED → CLOSED`) will der Büro-Dienst
einen oder mehrere Fehler festhalten, die bei der Bearbeitung vorgefunden wurden.
Diese sind unabhängig von der gemeldeten Störung (`faultTemplateKeys`): ein
Ticket kann eine gemeldete Störung des Typs "Rauchmelder piept" haben, aber als
festgestellten Fehler "Verkabelung defekt" liefern.

Der Katalog muss in der Administration editierbar sein (anlegen, bearbeiten,
archivieren, löschen), und die festgestellten Fehler müssen in der Statistik
auswertbar sein.

## Decision

1. **Tabelle `detected_errors`** mit `key` (unique), `label_de`, `label_en`,
   `archived_at` und UUID-v7-ID. Archivierung statt Hard-Delete: ein archivierter
   Key bleibt an bestehenden Tickets sichtbar, wird aber im Close-Dialog nicht
   mehr angeboten.
2. **`tickets.detected_error_keys text[]`** speichert die Keys bei Abschluss. Ein
   gelöschter Key wird nicht aus alten Tickets entfernt (kein CASCADE).
3. **Close-Route akzeptiert optionalen Body** `{ comment?, detectedErrorKeys? }`.
   Beide Felder sind optional; es gibt keine Pflicht. `comment` wird als
   `comment`-Event geschrieben, `detectedErrorKeys` auf die Ticket-Spalte.
4. **Admin-CRUD** unter `/api/v1/detected-errors` (`settings.read`/`settings.write`),
   Löschen blockiert bei Benutzung mit `409 detected_error_in_use`.
5. **Statistik** erweitert `stats_tickets` um `detected_error_keys`, neue View
   `stats_ticket_detected_errors` und `byDetectedError` in der Frequency-Antwort
   und dem CSV-Export. Keine neue Filter-Dimension.

## Alternatives

- **Festgestellter Fehler als Pflichtfeld bei Close:** abgelehnt, weil der
  Büro-Dienst nicht immer einen Fehler vorfindet und die Schließung nicht
  blockiert werden soll.
- **Einzelner Fehler statt Array:** abgelehnt, weil ein Techniker mehrere
  vorgefundene Fehler melden soll (analog `faultTemplateKeys` als Multi-Select).
- **Löschen statt Archivieren:** abgelehnt, weil historische Tickets den Key
  behalten müssen; Archivieren entspricht dem Muster von `text_templates`.
- **Neue Filter-Dimension in der Statistik:** abgelehnt für Phase 11, um den
  Scope klein zu halten; `byDetectedError` als reine Gruppierung reicht.

## Consequences

- Die Close-UI bekommt ein zusätzliches Feld; der Close-Route-Body ist
  abwärtskompatibel (Body optional, beide Felder optional).
- Archivierte Keys bleiben in `stats_ticket_detected_errors` sichtbar, solange
  Tickets sie tragen.
- Die Statistik-Seite bekommt ein neues Chart-Panel; die Filter-Routen ändern
  sich nicht.
