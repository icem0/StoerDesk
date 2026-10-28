# WP-M2-10: M2 Smoke-E2E

depends-on: WP-M2-09
milestone: m2

## Ziel

Playwright: QR scannen (simuliert), Formular ausfüllen mit 2 Fotos, senden, Ticket in /admin/tickets sichtbar. DE und EN.

## Spec-Referenzen

- specs/16-acceptance.md §18.1 #1, #3

## Aufgabe

1. `apps/web/e2e/report.spec.ts`
2. Test-Setup mit Seed + API + Web
3. 2 Tests (DE, EN)

## Akzeptanz

- 2 Tests grün, in CI
