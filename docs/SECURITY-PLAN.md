# Security-Audit — Procedure & Coverage

Erste Durchgang: 2026-11-06, HEAD `1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7`.

Repeat pass: 2026-11-09, diff `1ff37b1f..6351037` (181 files) — areas A and B in full,
areas C–K for the changed files. The findings of that pass live in
`.security/findings.md` (gitignored).

Closure pass: 2026-11-09, diff `6351037..249c8a0` (13 commits, WP-M9-26 … WP-M9-38) —
areas A and B re-checked in full (91 routes, no new route in the diff), C–K re-checked
only for the files the diff touched. Every finding SEC-004 … SEC-020 of the repeat pass
now resolves against a shipped fix; `.security/findings.md` carries the FIXED status.

CSV-import pass: 2026-11-10, diff `6a94e62..` (WP-M10-12, 5 files) — areas A and B
re-checked in full (still 91 routes, the package adds a service and shared contracts
only, no route), C–K re-checked for `apps/api/src/objects/import.ts`,
`packages/shared/src/schemas/object-import.ts` and `packages/shared/src/schemas/index.ts`:
the byte and row limits are enforced before parsing, the object-number lookup reads
only the object numbers of the file through `lower(object_no)` with drizzle-bound
values, every row passes through the existing create-object contract and the commit
runs in one transaction with per-row `{ code, params }` errors. No new finding.

CSV-route pass: 2026-11-10, diff `b087bd2..6087bd4` (WP-M10-13, 3 Dateien + die
Versionfile) — areas A and B re-checked in full (93 routes: the package adds
`POST /api/v1/objects/import` and `POST /api/v1/objects/import/preview`, both with
the `object.import` preHandler, no public capability and no bearer scope; die
guard answer `401 session_invalid` before `403 forbidden`), C–K re-checked for
`apps/api/src/objects/import-routes.ts` and `apps/api/src/index.ts`: the request
body passes through `objectImportRequestSchema` before anything is read (die
`csv` string is length-bound, an unknown mapping target is rejected with the
field path `mapping.<header>`), no value is interpolated into SQL there (the
service of WP-M10-12 binds its values through drizzle) and neither answer noch
log carries contact data or a token. No new finding.

Retention pass: 2026-11-10, diff `7349e01..` (WP-M10-15, two new modules, the
server registration and the version file) — areas A and B re-checked in full (still
93 routes: the package adds no route and no capability, the retention run is a
scheduled process started only from the direct API start, so no client input reaches
it), C–K re-checked for `apps/api/src/jobs/privacy-retention.ts`,
`apps/api/src/settings/privacy.ts` and `apps/api/src/index.ts`: every window
comparison, update and delete binds its values through drizzle (no SQL
interpolation, the batch ids come from the same select that carries the where clause),
the photo path is resolved against `UPLOAD_DIR` and a path that escapes the volume is
never touched, a missing file never fails the run and never reveals its name, stored
retention values are accepted only as whole months of one or more (a malformed row
falls back to the 24-month default), and both the job log and the settings module
carry aggregate counters, machine keys and setting keys only — no ticket number, no
name, no phone number, no e-mail and no IP. No new finding.

Privacy-routes pass: 2026-11-10, diff `28852ee..` (WP-M10-16, two new modules, the
server registration and the version file) — areas A and B re-checked in full (95 routes:
the package adds `GET /api/v1/privacy/tickets/:ticketNo/export` and
`POST /api/v1/privacy/tickets/:ticketNo/erase`, both with the `user.write`
preHandler, no public capability and no bearer scope, so the guard answers
`401 session_invalid` before `403 forbidden`) — the route table gained those two rows;
C–K re-checked for `apps/api/src/privacy/routes.ts`,
`packages/shared/src/schemas/privacy.ts` and `apps/api/src/index.ts`: the
`ticketNo` path parameter is format-validated by `ticketNoSchema` before it is used
(SEC-015 class), the request body passes through `personalDataEraseRequestSchema` with
a trimmed 5–1000-character bound before anything is written, every lookup and update
binds its values through drizzle, the export answers no `status_token` and no event
payload (the erasure payload carries the reason length only, never the reason text), the
erased event is inserted (never updated or deleted) so the append-only trigger keeps it,
the idempotency probe reads the same event type in the same transaction and neither the
answer nor a log line carries a contact value. No new finding.

Findings never live in the repository. They go into **`.security/findings.md`**
(gitignored via `.gitignore` line `.security/`). Tracked files, commit messages and
work-package titles never carry the location or description of an open gap.

## Run procedure
Comment pass: 2026-11-10, diff `979f19e..` (WP-M5-17, WP-M5-18, the two web modules
and the two locale files) — areas A and B re-checked in full (still 95 routes: the
packages add no route, no capability and no bearer scope, so the guard answers are
unchanged), C re-checked for the two changed web modules (the comment text is rendered
as text by React and never assembled as HTML, the dialog only displays what the field
holds) and D re-checked for `apps/web/src/sw.ts`, `apps/web/src/lib/sw-routes.ts` and
`apps/web/src/features/tickets/ticket-detail-page.tsx`: the write route matches only
`<api-base>/v1/tickets/<no>/<action>` (the public report and comment routes stay
outside), the invalidation deletes the cached copy of the written ticket from the
`internal-tickets` cache and touches no other cache, and the sign-out clear of that
cache stays the only place that empties it. No new finding.

Comment pass: 2026-11-12, diff `d9f7628..` (WP-M12-02, `apps/api/src/tickets/workflow.ts`
and the new `workflow-columns.integration.spec.ts`) — areas A and B re-checked in full
(the WP adds no route, no capability and no bearer scope, so the guard answers are
unchanged), C re-checked for `workflow.ts`: the added `work_order_type`/`work_order_number`
columns take the strings of the request payload only after the route's zod schema
(`type` ≤ 40, `number` ≤ 60 characters) and a `typeof` guard, and drizzle binds every
value — no SQL interpolation, no LIKE, no HTML assembly; the timestamps are derived on
the server, never read from the body. K re-checked for the new test: it writes one
throwaway user with a `randomUUID()` e-mail and no contact data, and the runner's log
lines stay code-level. No new finding.

Channel-config pass: 2026-11-12, diff `2fbdf80..` (WP-M14-04 — the schema, migration
`0033_notification_channel_config.sql`, the new config service and its unit test) —
areas A and B re-checked in full (no new route, no new capability, no bearer scope:
the package only adds table columns and a service), C–K re-checked for
`apps/api/src/db/schema.ts` and `apps/api/src/notifications/config.ts`: the service
runs one schema-bound select without any client input or value interpolation, the
write-only secret of a row only decides `secretSet` and never enters the answer, a
log or an event payload (ADR-0005 rule), and the unit test carries mock values
without contact data. No new finding.

Send-view pass: 2026-11-13, diff `a4e0d4f..` (WP-M14-22 — web UI only: the new
`ticket-send-page.tsx`, the detail header icon, the client route table, the
locales and the header test) — areas A and B re-checked in full (no new API
route, no new capability, no bearer scope: the client route `/tickets/:ticketNo/send`
stays behind `RequireSession` in the `App` shell), C–K re-checked for the touched
files: the `mailto:` subject and body only interpolate ticket fields the user
already sees and pass through `encodeURIComponent`, the deep link carries the
ticket number not a token, no SQL, no upload path and no log line is touched
and the locales hold no contact data. No new finding.

Telegram-linking pass: 2026-11-13, diff `7430de2..` (WP-M14-09 — the new linking
module, two session routes in `apps/api/src/notifications/routes.ts`, the shared
contracts and the unit test) — areas A and B re-checked in full (the package adds
`POST /api/v1/notifications/accounts/telegram/code` and
`POST /api/v1/notifications/accounts/telegram`, both guarded by the session only
— `401 session_invalid` without one, no permission key and no bearer scope; the
one-time code is bound to the session user and a foreign user is refused), C–K
re-checked for `apps/api/src/notifications/telegram-linking.ts`,
`apps/api/src/notifications/routes.ts` and `packages/shared/src/schemas/notification.ts`:
the redeem body passes through `redeemTelegramLinkCodeRequestSchema` (trimmed,
1–64 characters) before anything is read, the six-character code comes from
`node:crypto`'s `randomInt` over an unambiguous alphabet, the settings row
`notifications.telegram.code` is write-only and never answered, the Bot API URL
carries the token only in the request itself — a non-ok answer, an unreachable
bot and an invalid JSON answer become typed errors with the status or fixed
English text only, so the token never enters an answer, a log or an error
message (§11.13) — every settings and account write binds its values through
drizzle (the service of WP-M14-08), and the unit test carries a mock bot token
and mock users without contact data. No new finding.

Matrix-linking pass: 2026-11-13, diff `c65039c..` (WP-M14-11 — the new linking
module, the Matrix `POST` and the account `DELETE` in
`apps/api/src/notifications/routes.ts`, the shared contract and the unit test) —
areas A and B re-checked in full (the package adds `POST
/api/v1/notifications/accounts/matrix` and `DELETE
/api/v1/notifications/accounts/:channel`, both session-guarded only — `401
session_invalid` without one, no permission key and no bearer scope; the `DELETE`
predicate carries the session user id, so the account of another user can never
be removed), C–K re-checked for `apps/api/src/notifications/matrix-linking.ts`,
`apps/api/src/notifications/routes.ts` and
`packages/shared/src/schemas/notification.ts`: the body passes through
`matrixLinkingRequestSchema` (trimmed, length-bound) before anything is read, the
homeserver must be an https URL before the request and the access token travels
only in the `authorization` header of that one `whoami` request, a non-ok answer,
an unreachable homeserver and an invalid JSON answer become typed
`MatrixLinkingError`s carrying a status code or fixed English text only — the
token never enters an answer, a log or an error message (§11.13) — the verified
pair is stored via the drizzle-bound `storeAccount` of WP-M14-08 with the token
as the write-only secret and the answer reports `secretSet` only, and the unit
test carries mock tokens and mock users without contact data. No new finding.

WhatsApp-linking pass: 2026-11-13, diff `965c0e8..` (WP-M14-15 — the new linking
module, the WhatsApp `GET .../status` and `POST` in `apps/api/src/notifications/routes.ts`,
the own-channels section and the unit test) — areas A and B re-checked in full (the package
adds `GET /api/v1/notifications/accounts/whatsapp/status` and `POST
/api/v1/notifications/accounts/whatsapp`, both session-guarded only — `401
session_invalid` without one, no permission key and no bearer scope; the removal stays the
existing `DELETE /api/v1/notifications/accounts/:channel` whose predicate carries the session
user id, so the account of another user can never be removed), C–K re-checked for
`apps/api/src/notifications/whatsapp-linking.ts`, `apps/api/src/notifications/routes.ts` and
`apps/web/src/settings/notifications-page.tsx`: the bridge config is read from the row
`whatsapp` of `notification_channels` (public `config.baseUrl`, write-only `secret`) with the
`WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN` environment fallback, the bearer travels only
in the `authorization` header of that one `GET /status` request, an unreachable bridge, a
non-ok answer and an invalid JSON answer all resolve to `{ connected: false, chats: [] }`
— never an error — the submitted `chatId` passes through a trimmed, length-bound zod schema
before anything is read and is stored only when the bridge names it (a chat the bridge does
not know is a `422 invalid_request`, nothing is written), the account is stored via the
drizzle-bound `storeAccount` of WP-M14-08 with `externalId` the chat id and no secret, no
value is interpolated into SQL, and neither the answer, a log nor the error text carries the
bearer (§11.13) — the PWA section renders bridge chats and the account with no contact data.
No new finding.

Preferences-routes pass: 2026-11-13, diff `5abab01..` (WP-M14-16 — the new preference
service, the two session routes in `apps/api/src/notifications/routes.ts`, the shared
contracts and the unit test) — areas A and B re-checked in full (the package adds
`GET /api/v1/notifications/preferences` and `PUT /api/v1/notifications/preferences`,
both session-guarded only — `401 session_invalid` without one, no permission key and
no bearer scope; the user id is taken from the session, never from the request, and is
part of both the read and the delete predicate, so the selection of another user can
never be read or replaced), C–K re-checked for `apps/api/src/notifications/preferences.ts`,
`apps/api/src/notifications/routes.ts` and `packages/shared/src/schemas/notification.ts`:
the `PUT` body passes through `updateNotificationPreferencesRequestSchema` (the seven
event types and the seven channel kinds as enums, max. 100 rows) before anything is
written, an unknown event type or channel is a `422 invalid_request` that writes nothing,
the delete and the insert bind their values through drizzle in one transaction (no SQL
interpolation), a repeated `(event_type, channel)` pair is written once, the selection
carries machine keys only — no secret, no name, no contact value — and the unit test
carries mock users and mock channels. No new finding.



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
| POST | /api/v1/objects/import and /api/v1/objects/import/preview | object.import (objects/import-routes.ts:42) |
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
| GET/POST | /api/v1/privacy/tickets/:ticketNo/{export,erase} | user.write (apps/api/src/privacy/routes.ts) |
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
