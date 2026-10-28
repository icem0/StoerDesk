# WP-M1-12: Smoke-E2E

depends-on: WP-M1-09, WP-M1-11
milestone: m1

## Ziel

Playwright-Test: Login als Admin, /me zeigt Rolle admin, /admin/users sichtbar. DE und EN.

## Spec-Referenzen

- specs/16-acceptance.md §18.2 (Kriterium 12, 13)

## Aufgabe

1. `apps/web/e2e/auth.spec.ts` (2 Tests: DE, EN)
2. Test-Setup: DB mit Seed, API gestartet, Web gestartet (Playwright webServer)
3. `npm run check` enthält E2E

## Akzeptanz

- 2 Tests grün
- Test läuft in CI
