# WP-M2-06: Statusseite /s/:token

depends-on: WP-M2-04
milestone: m2

## Ziel

GET /api/v1/public/tickets/:token/status liefert Status + Verlauf ohne interne Details. UI /s/:token.

## Spec-Referenzen

- specs/06-report-form.md §Verhalten (Statuslink)

## Aufgabe

1. Token beim Anlegen generieren (`status_token`, 22 Zeichen, unique)
2. API-Route, Filter: nur type in (created, work_order_set, accepted, acknowledged, closed), keine Namen, keine internen Kommentare
3. UI: Timeline, Status-Badge
4. i18n de+en
5. Tests: 200 mit gültigem Token, 404 mit falschem, keine internen Felder in Response

## Akzeptanz

- 3 Tests grün
