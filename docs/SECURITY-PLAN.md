# Security-Audit — Procedure & Coverage

Erste Durchgang: 2026-11-06, HEAD `1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7`.

Findings never live in the repository. They go into **`.security/findings.md`**
(gitignored via `.gitignore` line `.security/`). Tracked files, commit messages and
work-package titles never carry the location or description of an open gap.

## Run procedure

1. `git ls-files` — the full file list; every area is worked along this list.
2. Area A Authentication: login/logout, cookie & session token handling, token
   entropy + storage, expiry, logout destroy, test/probe routes.
3. Area B Autorisation: route table (below) — Method, Pfad, Guard, note; every
   guarded route needs its `requirePermission`/capability preHandler; public routes
   are only the documented capability routes (IDOR check: objectNo, ticketId,
   photoId, status_token).
4. Area C Input/Injection: zod schemas, LIKE/SQL interpolation (drizzle binds
   values), path/filename construction, data-URL upload, body limits, header
   parsing, no HTML assembly, XSS on user content.
5. Area D Frontend: token storage in the PWA, CSP/HSTS, service worker cache.
6. Area E HTTP-Hardening: helmet, CORS origin list, reverse-proxy headers, TLS.
7. Area F Secrets/Config: `.env` ignored, `.env.example` placeholders, compose
   `:?` required secrets, `.github` no secret echo, dependabot.
8. Area G Files/Uploads: uploads volume, magic-byte validation, path joins.
9. Area H Dependencies: `npm audit` root + `apps/api` + `apps/web` +
   `packages/shared`.
10. Area I Docker/Compose: runtime uid, volumes, proxy headers.
11. Area J CI/CD: workflow env, pinned actions, secret scope.
12. Area K Logging/PII: log calls carry codes, no contact/email/phone params,
   no token in log lines.

Findings format (in `.security/findings.md`): `SEC-nnn` + short title; lines
`Fundstelle` (file:line), `Severity` (hoch|mittel|niedrig), `Status` (open|fixed),
`Attack path`, `Fix`.

## Route table (checked structure — B)

| Method | Pfad | Guard / Capability |
| --- | --- | --- |
| POST | /api/v1/auth/login | public (rate limit by IP) |
| POST | /api/v1/auth/logout | session cookie destroy |
| GET | /api/v1/me | requireUser |
| GET/POST/PATCH | /api/v1/users[/:id] | user.read / user.write |
| GET/POST/PATCH/DELETE | /api/v1/roles[/:key] | role.read / role.write |
| GET/POST/PATCH/DELETE | /api/v1/groups[/:id] | user.read / user.write |
| GET/PUT | /api/v1/settings/branding | settings.read / settings.write |
| GET/POST/PATCH/DELETE | /api/v1/text-templates[/:id] | settings.read / settings.write |
| GET | /api/v1/public/text-templates | public catalog (active only) |
| GET/POST/PATCH/DELETE | /api/v1/objects[/:objectNo] | object.read / object.write / object.delete |
| POST | /api/v1/objects/:objectNo/regenerate-qr | object.regenerateQr (qr.ts:186) |
| GET | /api/v1/public/qr/:token | public QR resolve |
| GET/POST/PATCH/PUT/DELETE | /api/v1/admin/bma-sync/* | object.read / object.import / object.write |
| GET/POST | /api/v1/admin/update/* | system.update |
| POST | /api/v1/tickets | ticket.create |
| GET | /api/v1/tickets | ticket.read (list) |
| GET | /api/v1/tickets/:ticketNo | ticket.read (detail) |
| POST | /api/v1/tickets/:ticketNo/comments | ticket.comment |
| GET | /api/v1/tickets/:ticketNo/photos/:photoId | ticket.read |
| DELETE | /api/v1/tickets/:ticketNo | ticket.delete |
| POST | /api/v1/tickets/:ticketNo/pause\|resume | ticket.review |
| POST | /api/v1/tickets/:ticketNo/{review,work-order,assign,offer,claim,accept,decline,acknowledge,close,reopen,cancel,uncancel} | workflow routes, ticket.* per route |
| POST | /api/v1/public/tickets | public report (IP+QR-token throttle) |
| GET/POST | /api/v1/public/tickets[/open\|:ticketNo/comments] | public duplicate hint (QR-token capability) |
| GET | /api/v1/public/tickets/:token/status | public status (status_token capability) |
| POST | /api/v1/public/altcha/challenge + verify | public altcha |
| GET | /api/v1/_test/require-permission/:keys | test-only (NODE_ENV=test, index.ts:135) |
| GET | /api/v1/health | public health |

IDOR keys checked: `objectNo` (DB-bound), `ticketId`/`ticketNo` (DB-bound),
`photoId` (randomUUID), `statusToken`/`qrToken` (capability, 256-bit random).

## Coverage

| Area | Status | checked-at |
| --- | --- | --- |
| A Authentication | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| B Autorisation | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| C Injection | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| D Frontend | complete (web/src read, tokens cookie-only) | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| E HTTP-Hardening | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| F Secrets/Config | complete (no gh-secret CLI run — compose + workflows read) | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| G Files/Uploads | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| H Dependencies | complete (npm audit clean, 4 scopes) | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| I Docker/Compose | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| J CI/CD | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |
| K Logging/PII | complete | 1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7 |

Missing scanners: none needed — the repo ships `npm audit` (used); no dedicated
secret scanner is configured (covered by compose/workflow reads; a future
pass may add one).

## Repeat run

- `checked-at` = audit SHA above. On a repeat: `git diff --name-only <SHA>..HEAD`.
- A and B are always re-checked in full.
- C–K: re-check only the files that changed in that diff.
- `fixed` findings: re-check their fundstelle only if it changed in that diff.
- H re-runs `npm audit`; J re-checks dependabot config.
