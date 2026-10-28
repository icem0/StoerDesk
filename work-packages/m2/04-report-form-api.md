# WP-M2-04: Öffentliches Meldeformular (API)

depends-on: WP-M2-02
milestone: m2

## Ziel

POST /api/v1/public/tickets (ohne Auth, Token im Body). Legt Ticket NEU an. Idempotenz via client_uuid.

## Spec-Referenzen

- specs/06-report-form.md §Felder, §Verhalten
- specs/03-ticket-workflow.md §Schritt 1

## Aufgabe

1. Route `POST /api/v1/public/tickets` mit Zod-Schema (qr_token, text, photos[], contact, client_uuid, locale)
2. Service: qr_token auflösen, Ticket anlegen (status NEU), Fotos speichern (Dateisystem /data/uploads), Event `created` schreiben
3. Idempotenz: unique auf client_uuid, zweiter Aufruf liefert 200 mit bestehendem Ticket
4. Rate-Limit 10/h pro IP + pro qr_token (konfigurierbar)
5. Tests: Happy Path, Idempotenz, Rate-Limit greift, ungültiger Token 404

## Akzeptanz

- 5 Tests grün
