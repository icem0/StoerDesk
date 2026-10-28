# WP-M1-08: requirePermission-Middleware

depends-on: WP-M1-07
milestone: m1

## Ziel

Fastify preHandler, lädt effektive Permissions (Union Rollen, minus user_permissions-Entzug), prüft ODER-Verknüpfung.

## Spec-Referenzen

- specs/01-rbac.md §3.7

## Aufgabe

1. `apps/api/src/auth/requirePermission.ts`
2. Effektive Permissions pro Request cachen (nicht pro Query)
3. 401 vs. 403 unterscheiden
4. Test-Route `GET /api/v1/_test/require-permission/:key` nur in NODE_ENV=test
5. Tests: User mit Rolle admin darf, User ohne Rolle 403, nicht eingeloggt 401, mehrere Permissions ODER-verknüpft

## Akzeptanz

- 4 Tests grün
- `requirePermission('a', 'b')` erlaubt, wenn eine der beiden da ist
