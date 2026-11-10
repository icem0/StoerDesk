# 13 — Festgestellte Fehler (detected errors)

**Chapter:** 14 (addendum)
**Scope:** ~200 lines
**Status:** written by WP-M11-01

Der binding summary ist `PLAN.md` §16 Phase 11. Dieser Slice beschreibt den
Admin-Katalog für festgestellte Fehler, die Speicherung bei Ticket-Abschluss und
die Auswertung in der Statistik. Die Entscheidungen dahinter sind ADR-0016.

## 13.1 Domäne

Ein **festgestellter Fehler** ist ein Fehler, der bei der Bearbeitung eines
Tickets vorgefunden wurde. Er ist unabhängig von der gemeldeten Störung:
ein Ticket kann z. B. eine gemeldete Störung des Typs "Rauchmelder piept"
haben, aber als festgestellten Fehler "Verkabelung defekt" liefern.

Ein Ticket kann null, einen oder mehrere festgestellte Fehler tragen. Der
Katalog der Fehler wird von der Administration gepflegt (anlegen, bearbeiten,
archivieren). Archivierte Fehler bleiben an bestehenden Tickets sichtbar, werden
aber im Close-Dialog nicht mehr angeboten.

## 13.2 Datenmodell

Tabelle `detected_errors`:

| Spalte | Typ | Regel |
| --- | --- | --- |
| `id` | uuid | PK, UUID v7 default |
| `key` | text | unique, nicht null, z. B. `verkabelung_defekt` |
| `label_de` | text | nicht null, deutscher Label |
| `label_en` | text | nicht null, englischer Label |
| `archived_at` | timestamptz | null = aktiv, gesetzt = archiviert |
| `created_at` | timestamptz | nicht null, default now |
| `updated_at` | timestamptz | nicht null, default now |

Spalte `tickets.detected_error_keys` (text[], default `'{}'::text[]`):
enthält die Keys der bei Abschluss festgestellten Fehler. Ein gelöschter oder
archivierter Key bleibt in bestehenden Tickets stehen (kein CASCADE, kein
NOT NULL auf den Ticket-Werten).

Ein Archivierter Key darf nicht neu angelegt werden, solange ein Ticket ihn
trägt (`409 detected_error_in_use`). Löschen ist nur möglich, wenn kein Ticket
den Key trägt; andernfalls wird archiviert statt gelöscht.

## 13.3 API

| Method and path | Permission | Answer |
| --- | --- | --- |
| `GET /api/v1/detected-errors` | `settings.read` | Liste aller Keys mit Labels und Archivstatus |
| `POST /api/v1/detected-errors` | `settings.write` | Anlegen: `{ key, label_de, label_en }` |
| `PATCH /api/v1/detected-errors/:key` | `settings.write` | Bearbeiten (Labels, `archived_at` setzen/entfernen) |
| `DELETE /api/v1/detected-errors/:key` | `settings.write` | Löschen nur wenn unbenutzt, sonst `409 detected_error_in_use` |

Die Close-Route `POST /api/v1/tickets/:ticketNo/close` akzeptiert einen optionalen
Body `{ comment?, detectedErrorKeys?: string[] }`. `comment` wird als
`comment`-Event geschrieben, `detectedErrorKeys` auf der Ticket-Spalte
gespeichert. Beide Felder sind optional. Die `closed`-Statusübergang bleibt
unverändert.

## 13.4 Statistik

Die View `stats_tickets` bekommt die Spalte `detected_error_keys`. Die neue View
`stats_ticket_detected_errors` liefert eine Zeile pro Ticket und
`detected_error_keys`-Eintrag (analog `stats_ticket_faults`).

Die Frequency-Antwort von `specs/12-stats.md` §12.3 gewinnt eine vierte
Gruppierung:

- `byDetectedError`: `[{ key, count }]`, eine Zeile pro distinto
  `detected_error_keys`-Eintrag, sortiert nach Count absteigend.

Der CSV-Export (`GET /api/v1/stats/export.csv`) trägt `byDetectedError` in die
Sektion `frequency`.

Es gibt keine neue Filter-Dimension (kein Filtern nach festgestelltem Fehler in
den Statistik-Routen).

## 13.5 UI

**Admin-Seite `/admin/detected-errors`:** Tabelle (key, de, en, status, usage),
Anlegen/Bearbeiten (key + beide Sprachen), Archivieren/Reaktivieren, Löschen
(blockiert bei Nutzung mit `409`). Geschützt durch `settings.read` (lesen) und
`settings.write` (schreiben). Eingebunden als Modul in der Admin-Home.

**Ticket-Detail Close-Dialog:** neben dem optionalen Kommentar eine
Multiselect-Auswahl der nicht-archivierten festgestellten Fehler (vom
`/api/v1/detected-errors`-Endpoint geladen). Beide Felder optional.

**Statistik-Seite:** ein neues Panel "Festgestellte Fehler" mit einem Balken-Chart
(Inline-SVG) über `byDetectedError` (Top 10).

## 13.6 Tests

Integrationstests gegen echte PostgreSQL:

- CRUD auf `/api/v1/detected-errors` inklusive `409 detected_error_in_use`
  beim Löschen eines benutzten Keys und beim Anlegen eines existierenden Keys.
- Close speichert `detected_error_keys` auf dem Ticket und schreibt das
  `comment`-Event.
- `queryFrequency` liefert `byDetectedError`.

UI-Tests optional (Playwright nur in CI).

## 13.7 Boundaries

- Keine Pflicht: ein Ticket kann ohne festgestellten Fehler geschlossen werden.
- Kein Offline-Queue für Close (bleibt online-only wie andere Workflow-Aktionen).
- Keine neue Statistik-Filter-Dimension.
- Keine PDF- oder E-Mail-Ausgabe der Statistik.
- Keine Beziehung zu `faultTemplateKeys` (getrennte Konzepte).
