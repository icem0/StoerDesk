# WP-M1-07: Auth (Login, Session)

depends-on: WP-M1-06
milestone: m1

## Ziel

POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/me.
Session-Cookie httpOnly SameSite=Lax. Argon2id.

## Spec-Referenzen

- specs/00-conventions.md §Stack (Auth)
- specs/01-rbac.md §3.7 (me-Endpoint)
- specs/14-nfr.md §Sicherheit (Rate-Limit)

## Aufgabe

1. `apps/api/src/auth/service.ts`: verifyPassword (Argon2id), createSession, destroySession, loadSession
2. `apps/api/src/auth/routes.ts`: login (Rate-Limit 5/min/IP), logout, me
3. `apps/api/src/auth/session.ts`: Fastify-Plugin, hängt `request.user` an
4. Zod-Schemas in `packages/shared/src/schemas/auth.ts`
5. Tests: Login ok, Login falsch (401), me ohne Cookie (401), me mit Cookie (200), logout (Cookie weg)

## Akzeptanz

- Cookie ist httpOnly, SameSite=Lax, Secure in Prod
- Rate-Limit greift
- Alle 5 Tests grün
