# Security-Audit — Procedure & Coverage

Erste Durchgang: 2026-11-06, HEAD `1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7`.

Repeat pass: 2026-11-09, diff `1ff37b1f..6351037` (181 files) — areas A and B in full,
areas C–K for the changed files. The findings of that pass live in
`.security/findings.md` (gitignored).

Closure pass: 2026-11-09, diff `6351037..249c8a0` (13 commits, WP-M9-26 … WP-M9-38) —
areas A and B re-checked in full (91 routes, no new route in the diff), C–K re-checked
only for the files the diff touched. Every finding SEC-004 … SEC-020 of the repeat pass
now resolves against a shipped fix; `.security/findings.md` carries the FIXED status.

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

Complete at the repeat pass: 91 routes, 78 guarded by `requirePermission`, 2 by
`requireUser`, 1 test-only probe, 11 public.

| Method | Pfad | Guard / Capability |
| --- | --- | --- |
| POST | /api/v1/auth/login | public (rate limit by IP) |
| POST | /api/v1/auth/logout | session cookie destroy |
| GET | /api/v1/me | requireUser |
| PATCH | /api/v1/users/me | requireUser |
| GET/POST/PATCH | /api/v1/users[/:id] | user.read / user.write |
| GET/POST/PATCH/DELETE | /api/v1/roles[/:key] | role.read / role.write |
| GET/POST/PATCH/DELETE | /api/v1/groups[/:id] | user.read / user.write |
| GET/PUT | /api/v1/settings/branding | settings.read / settings.write |
| GET | /api/v1/settings/title-switch | ticket.create |
| GET/PUT | /api/v1/settings/deadlines | settings.read / settings.write |
| GET/PUT | /api/v1/settings/oncall | settings.read / settings.write |
| GET/POST/PATCH/DELETE | /api/v1/text-templates[/:id] | settings.read / settings.write |
| GET | /api/v1/public/text-templates | public catalog (active only) |
| GET/POST/PATCH/DELETE | /api/v1/objects[/:objectNo] | object.read / object.write / object.delete |
| POST | /api/v1/objects/:objectNo/regenerate-qr | object.regenerate_qr (objects/qr.ts:164) |
| GET | /api/v1/public/qr/:token | public QR resolve |
| GET/POST/PATCH/DELETE | /api/v1/oncall/pools[/:id] | oncall.read / oncall.admin |
| GET | /api/v1/oncall/pools/:id/members | oncall.read |
| GET/POST/PATCH/DELETE | /api/v1/oncall/shifts[/:id] | oncall.read / oncall.plan / oncall.admin |
| POST | /api/v1/oncall/shifts/generate | oncall.plan |
| POST | /api/v1/oncall/shifts/:id/{confirm,decline} | oncall.confirm (+ service-level owner/admin check) |
| POST | /api/v1/oncall/shifts/:id/swap | oncall.swap (+ service: must own the shift) |
| GET | /api/v1/oncall/swaps | oncall.admin |
| POST | /api/v1/oncall/swaps/:id/{accept,approve,reject,cancel} | oncall.swap / oncall.admin (service-level pool-member and self checks) |
| GET | /api/v1/oncall/warnings | oncall.read |
| GET | /api/v1/oncall/ical-url | oncall.read |
| GET | /api/v1/oncall/ical/:token.ics | public (HMAC capability) |
| GET/POST/PATCH/DELETE | /api/v1/admin/bma-sync/* | object.read / object.import / object.write |
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
| POST | /api/v1/public/altcha/challenge | public altcha (verification runs inline in the report handler) |
| GET | /api/v1/_test/require-permission/:keys | test-only (NODE_ENV=test, index.ts:148) |
| GET | /api/v1/health | public health |

IDOR keys checked: `objectNo` (DB-bound), `ticketId`/`ticketNo` (DB-bound),
`photoId` (randomUUID), `statusToken`/`qrToken` (capability, 256-bit random).

## Coverage

| Area | Status | checked-at |
| --- | --- | --- |
| A Authentication | complete (re-checked in full at the closure pass) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| B Autorisation | complete (re-checked in full at the closure pass, 91 routes) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| C Injection | complete (re-checked for the changed files) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| D Frontend | complete (web/src read, tokens cookie-only) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| E HTTP-Hardening | complete | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| F Secrets/Config | complete (no gh-secret CLI run — compose + workflows read) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| G Files/Uploads | complete (re-checked for the changed files) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| H Dependencies | complete (npm audit: the runtime tree is clean — `npm audit --omit=dev` reports 0; the advisories are dev-only build tools and are not installed in the runtime image) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| I Docker/Compose | complete | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| J CI/CD | complete | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| K Logging/PII | complete | 249c8a006e472e77fd58bfc855fa8caf578fecdf |

Missing scanners: none needed — the repo ships `npm audit` (used); no dedicated
secret scanner is configured (covered by compose/workflow reads; a future
pass may add one).

## Repeat run

- `checked-at` = audit SHA above. On a repeat: `git diff --name-only <SHA>..HEAD`.
- A and B are always re-checked in full.
- C–K: re-check only the files that changed in that diff.
- `fixed` findings: re-check their fundstelle only if it changed in that diff.
- H re-runs `npm audit`; J re-checks dependabot config.
